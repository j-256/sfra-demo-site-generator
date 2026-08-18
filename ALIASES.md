# B2C Commerce Hostname Aliases Cheat Sheet

This is an operational reference for people who already know what a B2C Commerce hostname aliases file is supposed to accomplish. It concentrates on the parser quirks, evaluation rules, overloaded terms, and interactions that make a plausible-looking configuration silently ineffective.

The complete maintained examples are the [RefArch single-locale aliases](src/demo_data_sfra/sites/RefArch/urls/aliases) and [RefArchGlobal multi-locale aliases](src/demo_data_sfra/sites/RefArchGlobal/urls/aliases). Every example hostname in those files is commented out so generated sites cannot collide.

This guide stays with hostname aliases. It only discusses URL Rules where their generated pipeline endpoints interact with alias canonicalization.

> Import success is not proof that an alias mapping works. Test the resulting storefront route, locale, redirect, and generated URL.

## Keep four mechanisms separate

Most confusion comes from treating the whole file as one routing table. It actually participates in several related mechanisms:

1. **Incoming hostname routing:** A top-level hostname and its mapping rules decide which site and locale handle a storefront request.
2. **Special host behavior:** A mapping rule can redirect to another host, invoke a controller or pipeline, add parameters, or filter by site path or user agent.
3. **Absolute URL hostname selection:** `settings` supplies fallback hostnames when a URL action or storefront request does not already provide one.
4. **Duplicate-entry canonicalization:** `entry-point-pipelines` declares equivalent controllers or pipelines, while `entry-point-destination` ranks their canonical URL representations.

The useful request-side mental model is:

```text
incoming hostname
    -> matching top-level hostname key
    -> applicable root, site-path, or conditional mapping
    -> site, locale, redirect, or explicit pipeline
    -> normal storefront URL resolution
    -> duplicate-entry canonicalization, if configured
```

A hostname array is not a simple `switch` where exactly one object always wins. Ordinary mappings can coexist with the special entry-point declaration. Order matters when rules compete, particularly when a conditional rule is followed by an unconditional fallback.

## The format is JSON-like, not JSON

The OOTB starter says to remove comments before installation, but the platform parser accepts comments. It also accepts trailing commas after object properties, array elements, and top-level hostname entries. Site import and export preserve both comments and trailing commas byte-for-byte.

Use JSONC-style comments and trailing commas freely, but treat aliases as their own grammar rather than assuming that every feature of a particular JSONC parser is supported. The alias parser also accepts equal signs for legacy compatibility, but colons are clearer and remain compatible with JSON-aware tooling.

When a strict JSON validator is useful, validate a temporary copy with comments and trailing commas removed. Restore them afterward or leave the imported source untouched; strict JSON compatibility is a debugging technique, not an alias-file requirement.

`__version` is required and must remain the string `"1"`. Other values cause the entries to be ignored.

```jsonc
{
    "__version": "1",

    "settings": {
        // Optional URL-generation fallbacks
    },

    "www.example.com": [
        // Incoming mappings for this hostname
    ],
}
```

## `settings` chooses fallback hosts; it does not map requests

When B2C Commerce generates an absolute URL, the hostname source is effectively chosen in this order:

1. A hostname explicitly supplied by `URLAction`
2. The original storefront request hostname, when request context exists
3. The scheme-appropriate `http-host` or `https-host` site-wide default
4. `job-hostnames` in a requestless job context when no applicable site-wide default exists

This makes `http-host` and `https-host` defaults, not an alternative to ordinary hostname mappings. A generated URL might use a setting, but an incoming request for that hostname still needs a matching top-level hostname rule.

A settings-only hostname is not allowlisted for storefront routing. The platform rejects the incoming host until a top-level rule maps it, even though the same setting can be selected during URL generation.

The HTTP and HTTPS defaults may be different hostnames when a protocol-specific host is genuinely required. Each distinct value still needs its own top-level incoming mapping.

```jsonc
"settings": {
    "http-host": "www.example.com",
    "https-host": "www.example.com",

    "job-hostnames": {
        "default": "www.example.com"
    },
},

"www.example.com": [
    {
        "locale": "en_US"
    },
],
```

`job-hostnames` can be locale-specific. Resolution falls back from a locale-specific key to its language and then to `default`, so language keys are often enough:

```jsonc
"job-hostnames": {
    "default": "gb.example.com",
    "fr": "fr.example.com",
    "it": "it.example.com",
    "ja": "jp.example.com",
    "zh": "cn.example.com"
},
```

Every hostname emitted from `job-hostnames` should also have an incoming hostname mapping in the same site's aliases file.

Do not confuse `settings.site-path` with `if-site-path`. The former belongs to the `http-host`/`https-host` default-host settings model. The practical shared-hostname mappings in this repository use `if-site-path` inside hostname rules to establish site and locale ownership.

## Hostname ownership patterns

### A site owns the hostname root

A rule without `if-site-path` maps the hostname root to the site. Omitting `pipeline` lets the normal root entry point, usually `Default-Start`, handle the request.

```jsonc
"www.example.com": [
    {
        "locale": "en_US",
        "apply-to-host-only-request-with-params": "true"
    },
],
```

`apply-to-host-only-request-with-params` extends host-only matching to requests such as `https://www.example.com/?lang=en_US`. Use the string `"true"`, matching the platform's alias syntax. This matters when URL rules add a query parameter to a generated home URL.

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

The result is one site at `https://www.example.com/` and another at `https://www.example.com/gb/` and `https://www.example.com/fr/`. Adding a root rule to the second site creates competing ownership rather than a fallback.

### One site owns the root and locale paths

Combine one root rule with `if-site-path` rules. The root rule establishes the default locale; each path rule establishes another locale.

```jsonc
"global.example.com": [
    {
        "locale": "en_GB"
    },
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
],
```

`site-path-trailing-slash` controls normalization of the bare site path. With `"yes"`, `/fr` redirects to `/fr/`; with `"no"`, `/fr/` redirects to `/fr`.

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

> `Default-Start` and `Home-Show` are equivalent ways to enter the same logical page. Prefer its site-path representation; if no site path applies, use its hostname-root representation.

This rule affects both directions:

- An incoming duplicate such as `/home` or `/homepage` redirects to the selected canonical representation
- URL generation for any listed controller or pipeline emits the selected canonical representation directly

The entries in `entry-point-pipelines` are controller or pipeline names, not literal URL paths. Endpoints such as `/home` and `/homepage` reach those names through URL Rules before entry-point canonicalization collapses them.

The first listed pipeline is the preferred logical entry point when a pipeline-shaped destination is needed. Put the actual canonical controller or pipeline first.

The destination values are alternatives tried from left to right, not pieces concatenated to construct a URL:

| Destination | Meaning | Required mapping |
|---|---|---|
| `"host"` | The hostname-root representation, such as `https://www.example.com/` | A root mapping without `if-site-path` |
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

Order is consequential. On a dedicated international hostname, `["site-path", "host"]` preserves `/fr/` for `fr_FR` and falls back to `/` for a root-owning `en_GB`. Reversing it to `["host", "site-path"]` lets the root win first and can collapse locale homes onto `/`.

For a site that owns only paths beneath a hostname whose root belongs to another site, do not offer `"host"` as a destination. The canonical Global home must remain `/gb/` or `/fr/`, never the other site's `/`.

An entry-point rule does not establish hostname ownership, choose a locale by itself, or invent a site path. The ordinary rules beside it must already provide the representations it ranks.

## Redirect behavior is narrower than it looks

A `host` property permanently redirects to another hostname with a 301 response. A `path` property only contributes its configured value to a host-only source request.

```jsonc
"example.com": [
    {
        "host": "www.example.com",
        "path": "/"
    },
    {
        "apply-to-host-only-request-with-params": "true"
    },
],
```

The behavior is:

| Incoming request | Redirect target |
|---|---|
| `https://example.com/` | `https://www.example.com/` |
| `https://example.com/?src=x` | `https://www.example.com/?src=x` |
| `https://example.com/products/item` | `https://www.example.com/products/item` |

For a deeper request, the incoming path replaces the configured `path`; the platform does not prepend the configured path. Consequently, this rule cannot reliably move every deep URL from `old-example.fr/*` beneath `www.example.com/fr/*`. Use URL Redirects when the locale prefix must be retained for deep legacy URLs.

`path` has no effect without `host`. If a mapping contains both `host` and `pipeline`, hostname redirection wins; pipeline mappings apply when no `host` is supplied.

## A hostname root can invoke a controller without owning every path

This pattern turns only the hostname root into a campaign or vanity landing page:

```jsonc
"about.example.com": [
    {
        "locale": "en_US",
        "pipeline": "Page-Show",
        "params": {
            "cid": "about-us"
        },
        "apply-to-host-only-request-with-params": "true"
    },
],
```

The root invokes `Page-Show` with `cid=about-us`. Normal paths such as `/cart` continue through storefront URL routing rather than inheriting the landing-page pipeline.

The OOTB category-landing example uses the same mechanism with `"pipeline": "Search-Show"` and `"params": {"cgid": "electronics"}`. The maintained starters use `Page-Show` and `cid` so the example works without a populated search index while preserving the controller-plus-parameters behavior.

The two maintained recipes intentionally differ. RefArch's locale and host-only-query modifiers work with its bundled URL Rules, while RefArchGlobal keeps the OOTB-shaped pipeline rule minimal because adding that modifier combination makes the mapping inapplicable there. Alias properties are not safely composable mixins; test the exact combination on the target site.

## Conditional rules need an explicit fallback

Put a specific condition before an unconditional rule:

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

`if-agent-contains` matches text in the incoming `User-Agent` header. Any number of specific conditions can target different hosts before the final `else` branch. If the unconditional rule came first, it would preempt every user-agent-specific redirect. Each matching `host` action returns a permanent 301 response. SFRA is responsive, so this is primarily useful when a genuinely separate experience still exists.

## Practical field reference

| Property | Practical meaning | Common trap |
|---|---|---|
| `locale` | Locale selected when this mapping handles the request | The locale must belong to the site; omission falls back to site behavior |
| `if-site-path` | Path prefix that makes this rule applicable | This is a hostname rule, not a `settings` property |
| `site-path-trailing-slash` | Normalizes the matched site path | Values are `"yes"` and `"no"`, not booleans |
| `pipeline` | Controller or pipeline invoked by this mapping | Omit it on an ordinary root mapping when `Default-Start` should handle `/` |
| `params` | Parameters passed to the configured pipeline | A request parameter wins when the same identifier is also configured |
| `host` | Literal hostname target for a permanent 301 redirect | Unrelated to the abstract `"host"` entry-point destination token |
| `path` | Redirect path used for a host-only source request | A deeper incoming path replaces it; it is ignored without `host` |
| `apply-to-host-only-request-with-params` | Applies host-only behavior when a query string is present | Use the string `"true"` |
| `if-agent-contains` | Applies a rule to matching user agents | Put it before an unconditional fallback |
| `entry-point-pipelines` | Controllers or pipelines treated as duplicate entry points | Put the preferred logical entry point first |
| `entry-point-destination` | Ordered canonical-representation preferences | Values are alternatives, not URL components |

## Failure modes worth memorizing

- A hostname in `settings` can generate URLs while incoming requests still fail because no top-level hostname rule maps it.
- A top-level hostname rule can route incoming requests while requestless URL generation still lacks a hostname fallback.
- `site-path` and `if-site-path` are not interchangeable.
- The word `host` means a literal redirect target in one context and an abstract root representation in another.
- `entry-point-destination` order can silently remove locale paths while leaving every URL technically valid.
- A configured redirect `path` is not prepended to deeper incoming paths.
- A syntactically accepted aliases file can be semantically inert, lose to another site's mapping, or canonicalize to the wrong place.
- A custom hostname still needs the corresponding DNS or sandbox hostname registration outside the aliases file.
- The reserved path prefixes `/dw`, `/_dw`, and `/s` cannot be configured as alias mappings.
- Comments and trailing commas are valid even though strict JSON validators and the OOTB warning imply otherwise.

## Verification matrix

Test the exact archive that will be imported. Register test hostnames with the sandbox or resolve them locally as appropriate, and inspect both the response and the site or locale that actually served it.

| Probe | What it catches |
|---|---|
| `https://host/` | Root ownership, default locale, and root pipeline |
| `https://host/?probe=1` | Missing `apply-to-host-only-request-with-params` behavior |
| `https://host/fr` and `/fr/` | Site-path ownership and trailing-slash normalization |
| `/home` and `/homepage` at the root | Entry-point canonicalization to the host |
| `/fr/home` and `/fr/homepage` | Entry-point canonicalization without losing the locale path |
| A normal deep storefront URL | Over-broad root pipeline or redirect mappings |
| Old hostname root with a query string | Host-only redirect and query preservation |
| Old hostname with a deep path | The configured-`path` replacement behavior |
| URL generation during a storefront request | Original-request hostname precedence and canonical endpoints |
| URL generation from a job | `http-host`/`https-host` versus `job-hostnames` fallback behavior |
| Site export after import | Parser preservation of comments, commas, and the exact stored source |

Inspect the first response without automatically following redirects so the status and `Location` header are visible. Then follow the redirect and confirm the expected site and locale render. A generic 200 response is not enough.

The maintained examples in this repository were checked by site-importing the exact alias source, issuing storefront requests for the routing and canonicalization behavior, and exporting the files for comparison. That level of verification is intentional because aliases are unusually good at accepting configurations that look right but do not control the intended route.

## Official references

- [Hostname Aliases for B2C Commerce](https://help.salesforce.com/s/articleView?id=cc.b2c_hostname_aliases.htm&language=en_US&type=5)
- [Duplicate Home Page URLs](https://help.salesforce.com/s/articleView?id=cc.b2c_avoiding_duplicate_home_page_urls.htm&language=en_US&type=5)
- [Configure a Hostname Alias](https://help.salesforce.com/s/articleView?id=cc.b2c_configuring_hostname_alias.htm&language=en_US&type=5)
