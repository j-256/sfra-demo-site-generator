# Source Provenance

The pristine data under `src/demo_data_sfra/` is vendored (copied), not submoduled, because the data is effectively immutable and the tool must run in constrained/offline environments (e.g. a Staging context with no outbound access to public GitHub).

- Upstream: https://github.com/SalesforceCommerceCloud/storefrontdata
- package.json version at vendor time: 6.3.0
- demo_data_sfra/version.txt: 103.0.0
- Corrected `src/cache-settings.xml`: development page-cache ON, staging OFF, production ON (the OOTB data ships these reversed for the Staging-replicates-to-Dev/Prod topology).

To refresh from upstream, run `scripts/refresh-source.sh` and commit the result as a deliberate, reviewed change.
