# Source Provenance

The pristine data under `src/demo_data_sfra/` is vendored (copied), not submoduled, because the data is effectively immutable and the tool must run in constrained/offline environments (e.g. a Staging context with no outbound access to public GitHub).

- Upstream: https://github.com/SalesforceCommerceCloud/storefrontdata
- package.json version at vendor time: 6.3.0
- demo_data_sfra/version.txt: 103.0.0
- Corrected `src/cache-settings.xml`: development page-cache ON, staging OFF, production ON (the OOTB data ships development and staging reversed; production is ON in both the pristine and corrected versions).

To refresh from upstream, run `scripts/refresh-source.sh` and commit the result as a deliberate, reviewed change.

`sites/<site>/urls/aliases` ships entirely commented out at vendor time, so no hostname alias is declared and two generated datasets cannot clash on the same hostname. If a future upstream refresh un-comments any of those example hosts, that assumption breaks: two people's generated sites would then declare the same literal hostname, since this file is copied verbatim and never tokenized (see the "What it does NOT touch" section in README.md). Check this file specifically on every refresh.
