# B2C Commerce Hostname Aliases Cheat Sheet

This is an operational reference for people who already know what a B2C Commerce hostname aliases file is supposed to accomplish. It concentrates on the parser behavior, evaluation order, overloaded terms, and interactions that make a plausible-looking configuration silently ineffective.

The complete maintained examples are the [RefArch single-locale aliases](src/demo_data_sfra/sites/RefArch/urls/aliases) and [RefArchGlobal multi-locale aliases](src/demo_data_sfra/sites/RefArchGlobal/urls/aliases). Every example hostname in those files is commented out so generated sites cannot collide.

This guide stays with hostname aliases. It only discusses URL Rules where their generated pipeline endpoints interact with alias canonicalization.

> Import success is not proof that an alias mapping works. Test the resulting storefront route, locale, redirect, generated URL, and runtime error behavior.

## Keep four mechanisms separate

Most confusion comes from treating the whole file as one routing table. It participates in four related mechanisms:

1. **Settings-based inbound ownership:** `settings.http-host`, `settings.https-host`, `settings.default`, and `settings.site-path` can assign a hostname root or path to a site.
2. **Top-level inbound rules:** A top-level hostname array can select a site and locale, normalize a site path, redirect, invoke a controller or pipeline, or filter by user agent.
3. **Absolute URL hostname selection:** URL APIs consult different hostname sources according to the API, request or job context, scheme settings, and applicable job hostname.
4. **Duplicate-entry canonicalization:** `entry-point-pipelines` declares equivalent controllers or pipelines, while `entry-point-destination` ranks their canonical URL representations.

The request-side evaluation order starts with settings:

```text
incoming hostname
    -> matching settings ownership, including default or site-path
    -> otherwise matching top-level hostname key and rule
    -> site, locale, redirect, or explicit pipeline
    -> normal storefront URL resolution
    -> duplicate-entry canonicalization, if configured
```

A settings match wins before top-level rules, even when a top-level rule has a more specific `if-site-path`. Use one ownership model consistently for every site that shares a hostname.

A hostname array is not a simple `switch` where exactly one object always wins. Conditional and unconditional rules can compete, ordinary mappings can coexist with the special entry-point declaration, and order is consequential.

## The format is JSON-like, not JSON

The OOTB starter says to remove comments before installation, but the platform parser accepts comments. It also accepts trailing commas after object properties, array elements, and top-level hostname entries. Site import and export preserve both comments and trailing commas byte-for-byte.

The alias parser accepts equal signs for legacy compatibility, but colons are clearer and remain compatible with JSON-aware tooling. Treat aliases as their own grammar rather than assuming every feature of a particular JSONC parser is supported.

When a strict JSON validator is useful, validate a temporary sanitized copy. Do not change the imported source merely to satisfy a validator that does not implement the platform grammar.

`__version` must be the string `"1"`. A site import can report success and store a file with another version or malformed syntax, but runtime compilation ignores its mappings. The tested result was an unallowlisted custom hostname and a 200 Technical Page. Business Manager applies a stricter save-time gate and rejects those inputs instead of storing them.

```jsonc
{
    "__version": "1",

    "settings": {
        // Optional inbound ownership and URL-generation configuration
    },

    "www.example.com": [
        // Optional top-level ownership or action rules
    ],
}
```

## Settings participate in inbound ownership

`http-host` and `https-host` are not generation-only fallbacks. On an eCDN-registered hostname, a settings-only configuration can map incoming requests to the site. Settings are evaluated before top-level hostname arrays.

```jsonc
"settings": {
    "http-host": "www.example.com",
    "https-host": "www.example.com"
},
```

The same hostname can be assigned to multiple sites through settings. Give one site the root with `default: true` and give another site a path with `site-path`:

```jsonc
// Root-owning site
"settings": {
    "http-host": "www.example.com",
    "https-host": "www.example.com",
    "default": true
},
```

```jsonc
// Path-owning site
"settings": {
    "http-host": "www.example.com",
    "https-host": "www.example.com",
    "site-path": "fr"
},
```

This settings topology maps `/` to the default site and `/fr/` to the path site. The path site uses its site default locale. When one site needs several locale-specific paths, top-level `if-site-path` rules provide the required per-path locale selection.

Do not put settings ownership for a hostname on one participating site and top-level ownership for the same hostname on another. The settings match captures the request before the top-level rule can run.

## Absolute URL hostname selection is API-specific

There is no single hostname-precedence list that applies to every URL API. These behaviors were observed with the instance CDN default-domain feature enabled:

| Call and context | Observed hostname selection |
|---|---|
| `URLUtils.https(URLAction(host), ...)` in a job | The explicit `URLAction` hostname |
| `URLUtils.url(URLAction(host), ...).https()` in a job | The host selected while `url()` constructs the URL: `http-host` when configured, otherwise the instance `.my` domain |
| `URLUtils.https(pipeline, ...)` during a storefront request | `https-host`, otherwise the incoming request hostname |
| `URLUtils.https(pipeline, ...)` in a job | `https-host`, then an applicable mapped `job-hostnames` value, then the instance `.my` domain |

Calling `.https()` on the result of `URLUtils.url(...)` changes the scheme after the URL has been constructed. It does not make that call equivalent to `URLUtils.https(...)`.

The instance `.my.commercecloud.salesforce.com` hostname is the normal final fallback when Instance CDN Default Domain is enabled. The `.dx.commercecloud.salesforce.com` hostname is the instance origin or legacy entry point, not the normal generated storefront default.

Treat Enable Instance CDN Default Domain as the normative behavior. Feature-switch metadata can retain a historical default of `false` from the gradual rollout; that metadata is not a reason to design new hostname behavior around the `.dx` origin.

`job-hostnames` resolves an allowed locale by exact locale, then language, then `default`:

```jsonc
"job-hostnames": {
    "default": "gb.example.com",
    "en": "gb.example.com",
    "en_US": "us.example.com",
    "fr": "fr.example.com"
},
```

For `en_US`, the exact key wins over `en`. For `en_GB`, `en` applies. A locale with neither uses `default`.

A `job-hostnames` value must also be mapped to the same site if it is expected to be used. An unmapped value is silently skipped and generation falls through to the instance `.my` domain.

## Related feature switches

These instance switches change the environment around aliases without changing the alias grammar:

- **Enable Instance CDN Default Domain** supplies the `.my` storefront fallback described above
- **Use Custom Hostname for Preview URL** makes Business Manager preview prefer a configured custom hostname, then the eCDN default zone, then the MRT origin
- **Permit Allowlisted Hostnames Only** rejects arbitrary unregistered hostnames, so a syntactically valid alias still needs eCDN or sandbox hostname registration

Preview URL selection is separate from runtime `URLUtils` hostname selection. Test both when Business Manager preview and storefront-generated links must agree.

## Top-level hostname ownership patterns

Use top-level rules when a site needs per-locale paths, user-agent conditions, redirects, or explicit pipelines. Do not also claim the same hostname through settings.

### A site owns the hostname root

A rule without `if-site-path` maps the hostname root to the site. Omitting `pipeline` lets the normal root entry point, usually `Default-Start`, handle the request.

```jsonc
"www.example.com": [
    {
        "locale": "en_US",
        "apply-to-host-only-request-with-params": true
    },
],
```

`apply-to-host-only-request-with-params` extends host-only matching to requests such as `https://www.example.com/?lang=en_US`. Both boolean `true` and string `"true"` work; boolean `true` is clearer.

### Two sites share one hostname

Put the root mapping in exactly one site's file and only path mappings in the other site's file.

Site that owns `/`:

```jsonc
"www.example.com": [
    {
        "locale": "en_US"
    },
],
```

Site that owns locale paths:

```jsonc
"www.example.com": [
    {
        "if-site-path": "gb",
        "locale": "en_GB",
        "site-path-trailing-slash": "yes"
    },
    {
        "if-site-path": "fr",
        "locale": "fr_FR",
        "site-path-trailing-slash": "yes"
    },
],
```

The result is one site at `https://www.example.com/` and another at `https://www.example.com/gb/` and `https://www.example.com/fr/`. A second root rule is not a fallback. It creates competing ownership, and one site can preempt the other regardless of import order.

### One site owns the root and locale paths

Put every `if-site-path` rule before the unconditional root rule. The path rules select their locales; the final root rule selects the default locale.

```jsonc
"global.example.com": [
    {
        "if-site-path": "fr",
        "locale": "fr_FR",
        "site-path-trailing-slash": "yes"
    },
    {
        "if-site-path": "it",
        "locale": "it_IT",
        "site-path-trailing-slash": "yes"
    },
    {
        "locale": "en_GB",
        "apply-to-host-only-request-with-params": true
    },
],
```

`site-path-trailing-slash: "yes"` redirects `/fr` to `/fr/`. The value `"no"` does the reverse and redirects `/fr/` to `/fr`.

### Each locale owns a domain

Give every locale hostname its own root mapping. Repeat any entry-point canonicalization for each hostname.

```jsonc
"gb.example.com": [
    {
        "locale": "en_GB"
    },
],

"fr.example.com": [
    {
        "locale": "fr_FR"
    },
],
```

## Entry points are equivalence classes plus destination preferences

The shortest accurate translation is:

```jsonc
{
    "entry-point-pipelines": ["Default-Start", "Home-Show"],
    "entry-point-destination": ["site-path", "host"]
}
```

> `Default-Start` and `Home-Show` are equivalent ways to enter the same logical page. Prefer its site-path representation; if no site path applies for that locale, use its hostname-root representation.

This rule affects both directions:

- An incoming duplicate such as `/home` or `/homepage` redirects to the selected canonical representation
- URL generation for a listed controller or pipeline emits the selected canonical representation

The entries in `entry-point-pipelines` are controller or pipeline names, not literal URL paths. Endpoints such as `/home` and `/homepage` reach those names through URL Rules before entry-point canonicalization collapses them.

The first listed pipeline is the preferred logical entry point when a pipeline-shaped destination is needed. Reversing the list changes which pipeline endpoint remains canonical.

The destination values are alternatives tried from left to right, not pieces concatenated to construct a URL:

| Destination | Meaning | Required mapping |
|---|---|---|
| `"host"` | The hostname-root representation, such as `https://www.example.com/` | A root mapping for the same site and locale |
| `"site-path"` | A matching site-path root, such as `https://www.example.com/fr/` | An applicable `if-site-path` mapping |
| `"pipeline"` | The preferred pipeline's normal URL-rule endpoint | A generated URL for the preferred pipeline |

The `"host"` token here is not the same thing as a mapping rule's `"host": "other.example.com"` redirect property. Likewise, `"site-path"` does not name a path; it asks the platform to use an applicable `if-site-path` mapping.

Choose the preference list from the site's ownership shape:

| Site shape | Destination preference | Canonical home |
|---|---|---|
| Site owns only the hostname root | `["host"]` | `/` |
| Site owns only paths below a shared hostname | `["site-path"]` | `/gb/`, `/fr/`, and so on |
| Site owns the root for its default locale and paths for other locales | `["site-path", "host"]` | Locale path when available, otherwise `/` |
| A controller or pipeline endpoint should remain visible | `["pipeline"]` or a preference ending in `"pipeline"` | The preferred pipeline URL |

Both ordinary rule order and destination order matter. For one site that owns a root and locale paths, put path rules before the root rule and put `"site-path"` before `"host"` to preserve non-default locale paths. Reversing either order can collapse a locale home to the hostname root.

For a site that owns only paths beneath a hostname whose root belongs to another site, do not offer `"host"` as a destination. The other site's root is not an applicable representation, so the path-only site must remain under its own path.

An entry-point rule does not establish hostname ownership, choose a locale by itself, or invent a site path. The ordinary rules beside it must already provide the representations it ranks.

## Mapping actions are not composable mixins

Fields that work separately can change meaning or become irrelevant when combined. Test the exact object, request path, and query string.

### Host redirect with an optional root path

A `host` property permanently redirects a host-only request to another hostname. A `path` property supplies the redirect path for that host-only request.

```jsonc
"example.com": [
    {
        "host": "www.example.com",
        "path": "/",
        "apply-to-host-only-request-with-params": true
    },
],
```

| Incoming request | Observed behavior |
|---|---|
| `https://example.com/` | 301 to `https://www.example.com/` |
| `https://example.com/?src=x` | 301 with the incoming query preserved |
| `https://example.com/products/item` | No alias host redirect; normal storefront routing continues on the incoming host |

The configured `path` is neither prepended to nor replaced by a deeper incoming path because the host action is not applied to that deep request. Use URL Redirects when legacy deep URLs must move to another hostname or locale prefix.

`path` has no effect without `host`.

### Host and pipeline combine

When one mapping contains both `host` and `pipeline`, the fields combine. `host` chooses the destination hostname and the pipeline's generated URL chooses the destination path. A configured `path` in the same object is ignored in favor of the pipeline URL.

```jsonc
"campaign.example.com": [
    {
        "host": "www.example.com",
        "locale": "en_US",
        "pipeline": "Home-Show",
        "params": {
            "src": "campaign"
        },
        "apply-to-host-only-request-with-params": true
    },
],
```

For redirect target construction, an incoming query value wins when the same identifier is also configured in `params`. Other configured parameters remain.

### A hostname root invokes a controller

Without `host`, a `pipeline` mapping invokes that controller or pipeline for the hostname root:

```jsonc
"about.example.com": [
    {
        "locale": "en_US",
        "pipeline": "Page-Show",
        "params": {
            "cid": "about-us"
        },
        "apply-to-host-only-request-with-params": true
    },
],
```

The root invokes `Page-Show` with `cid=about-us`. Query-bearing root requests need the apply flag. Normal paths such as `/cart` continue through storefront URL routing rather than inheriting the root pipeline.

For direct pipeline invocation, a configured parameter wins over an incoming query value with the same identifier. This differs from redirect target construction, so do not state one universal parameter-precedence rule.

The OOTB category-landing pattern uses the same mechanism with `Search-Show` and `cgid`. The maintained starters use `Page-Show` and `cid` so the example works without a populated search index.

### User-agent conditions need a fallback

Put specific conditions before an unconditional rule:

```jsonc
"device.example.com": [
    {
        "if-agent-contains": ["iphone", "ipod", "android"],
        "host": "m.example.com"
    },
    {
        "if-agent-contains": ["blackberry"],
        "host": "legacy-mobile.example.com"
    },
    {
        "host": "www.example.com"
    },
],
```

`if-agent-contains` matches the incoming `User-Agent` case-insensitively. The first applicable rule wins, so an unconditional rule placed first preempts every later user-agent condition. Each matching `host` action returns a permanent 301 response.

When `if-site-path` is present, the rule acts as a site-path mapping. `host`, `path`, and `if-agent-contains` in that same object are ignored. Keep those behaviors in separate rules.

## Practical field reference

| Property | Practical meaning | Common trap |
|---|---|---|
| `locale` | Locale selected when this mapping handles the request | An invalid site locale makes the mapping inapplicable |
| `if-site-path` | Path prefix that makes a top-level rule applicable | Settings matches run first; `host`, `path`, and user-agent fields in this object are ignored |
| `site-path-trailing-slash` | Normalizes the matched site path | Values are `"yes"` and `"no"`, not booleans |
| `pipeline` | Controller or pipeline invoked by a root mapping or used to build a redirect path | With `host`, it supplies the destination path and supersedes `path` |
| `params` | Parameters passed to a pipeline or added to a redirect | Direct invocation and redirect construction have different collision precedence |
| `host` | Literal hostname target for a permanent root redirect | Unrelated to the abstract `"host"` entry-point destination token |
| `path` | Redirect path for a host-only source request | Ignored without `host` and superseded by `pipeline` |
| `apply-to-host-only-request-with-params` | Applies host-only behavior when a query string is present | Boolean `true` and string `"true"` both work |
| `if-agent-contains` | Applies a rule to matching user agents | Matching is case-insensitive and order-sensitive |
| `entry-point-pipelines` | Controllers or pipelines treated as duplicate entry points | Put the preferred logical entry point first |
| `entry-point-destination` | Ordered canonical-representation preferences | Values are alternatives, not URL components |

## Failure modes worth memorizing

- A settings-owned hostname captures inbound requests before top-level rules, including a more specific `if-site-path`
- Mixing settings ownership on one site with top-level ownership on another breaks the intended shared-host topology
- Duplicate root ownership is competition, not fallback behavior
- An unmapped `job-hostnames` value is silently skipped and generation can fall through to the instance `.my` domain
- `URLUtils.url(...).https()` and `URLUtils.https(...)` can choose different hosts
- `site-path`, `settings.site-path`, and `if-site-path` are related but not interchangeable
- The word `host` means a literal redirect target in one context and an abstract root representation in another
- Ordinary rule order and `entry-point-destination` order can independently remove locale paths while leaving valid URLs
- A host redirect does not apply to deeper incoming paths
- A site import can store invalid alias source while runtime ignores every mapping
- A custom hostname still needs eCDN or sandbox hostname registration outside the aliases file
- The reserved path prefixes `/dw`, `/_dw`, and `/s` cannot be claimed as alias site paths
- Hostname aliases and eCDN custom-domain registrations are instance-specific deployment data and must be configured on each target instance

## Verification matrix

Test the exact archive that will be imported. Register test hostnames with the eCDN or sandbox hostname service, and inspect both the response and the site or locale that served it.

| Probe | What it catches |
|---|---|
| Settings-only `https://host/` | Settings-based inbound ownership |
| `https://host/` with settings and top-level rules on different sites | Settings precedence and accidental capture |
| `https://host/?probe=1` | Missing `apply-to-host-only-request-with-params` behavior |
| `https://host/fr` and `/fr/` | Site-path ownership and trailing-slash normalization |
| `/home` and `/homepage` at the root | Entry-point pipeline and destination ordering |
| `/fr/home` and `/fr/homepage` | Canonicalization without losing the locale path |
| A normal deep storefront URL | Over-broad assumptions about root pipeline or redirect mappings |
| Redirect hostname root with and without a query | Host-only redirect, parameter collision, and query preservation |
| Redirect hostname with a deep path | Confirmation that the alias host action is not applied |
| URL generation during a storefront request | `https-host` versus incoming-request fallback |
| Each URL API from a job | Explicit action, scheme setting, mapped job hostname, and `.my` fallback behavior |
| Exact, language-only, default, and unmapped job locales | `job-hostnames` fallback and allowlist applicability |
| Save through Business Manager and import through Site Import | Different validation gates for malformed syntax and unsupported versions |
| Site export after import | Parser preservation of comments, commas, and exact stored source |

Inspect the first response without automatically following redirects so the status and `Location` header are visible. Then follow the redirect and confirm the expected site and locale render. A generic 200 response is not enough because invalid aliases can return a 200 Technical Page.

## Official references

- [Hostname Aliases for B2C Commerce](https://help.salesforce.com/s/articleView?id=cc.b2c_hostname_aliases.htm&language=en_US&type=5)
- [Duplicate Home Page URLs](https://help.salesforce.com/s/articleView?id=cc.b2c_avoiding_duplicate_home_page_urls.htm&language=en_US&type=5)
- [Configure a Hostname Alias](https://help.salesforce.com/s/articleView?id=cc.b2c_configuring_hostname_alias.htm&language=en_US&type=5)
- [Configure the Embedded CDN](https://help.salesforce.com/s/articleView?id=cc.b2c_configure_the_embedded_cdn.htm&language=en_US&type=5)
