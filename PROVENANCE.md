# Source Provenance

The data under `src/demo_data_sfra/` is vendored (copied), not submoduled, because the upstream dataset is effectively immutable and keeping it in the repository makes local generation self-contained and reproducible. The generated site archive is then imported into the target B2C Commerce instance, such as Staging.

- Upstream: https://github.com/SalesforceCommerceCloud/storefrontdata
- package.json version at vendor time: 6.3.0
- demo_data_sfra/version.txt: 103.0.0
- Corrected `src/cache-settings.xml`: development page-cache ON, staging OFF, production ON (the OOTB data ships development and staging reversed; production is ON in both the pristine and corrected versions).
- Maintained `sites/RefArch/urls/aliases` and `sites/RefArchGlobal/urls/aliases`: comprehensive, commented references for root-owning and multi-locale hostname configurations.

To refresh from upstream, run `scripts/refresh-source.sh` and commit the result as a deliberate, reviewed change. The refresh preserves the corrected cache settings and both alias starters.

The maintained alias references leave every example hostname commented, so no hostname alias is declared and generated datasets cannot clash on a literal hostname. The generator copies these files byte for byte and does not suffix identifiers within their contents.
