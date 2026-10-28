# Changelog

## [0.3.1](https://github.com/itay28/Military-TD/compare/v0.3.0...v0.3.1) (2026-10-28)


### Features

* cap game speed at ×3 ([#281](https://github.com/itay28/Military-TD/issues/281)) ([2dd31fc](https://github.com/itay28/Military-TD/commit/2dd31fcd7fb14d9f43981ee4c430ab89808f194a))
* CI check for asset licenses and credits ([#256](https://github.com/itay28/Military-TD/issues/256)) ([a0f1ebd](https://github.com/itay28/Military-TD/commit/a0f1ebd6f8d7f34e83ac8c155b480d4fbbe75a09))
* Credits screen from the asset manifest ([#260](https://github.com/itay28/Military-TD/issues/260)) ([663113d](https://github.com/itay28/Military-TD/commit/663113ddc4ae3ba67b9f66063cf162c6957258f2))
* draw the map from the tileset ([#267](https://github.com/itay28/Military-TD/issues/267)) ([fe7263b](https://github.com/itay28/Military-TD/commit/fe7263b9ddd694a276d1b40dac3d1aa1e9144993))
* enemy sprites face their travel with a movement animation ([#268](https://github.com/itay28/Military-TD/issues/268)) ([fe9ba72](https://github.com/itay28/Military-TD/commit/fe9ba7262ed73b0d5da64a9f4a2a6315e3097800))
* import and validate Tiled maps ([#254](https://github.com/itay28/Military-TD/issues/254)) ([c209bbe](https://github.com/itay28/Military-TD/commit/c209bbe88a38008fdf86a7d833d5953ef4af466b))
* Kenney CC0 asset packs with a manifest and generated credits ([#255](https://github.com/itay28/Military-TD/issues/255)) ([7bb6561](https://github.com/itay28/Military-TD/commit/7bb65612a363616544d05a343833f672da2ba3c9))
* rebuild the MVP map in Tiled ([#272](https://github.com/itay28/Military-TD/issues/272)) ([3d4ab12](https://github.com/itay28/Military-TD/commit/3d4ab12a892f90d9c21baae97e3ab3c5a2d9d767))
* sprite atlas with shape fallback ([#264](https://github.com/itay28/Military-TD/issues/264)) ([959b97f](https://github.com/itay28/Military-TD/commit/959b97f7d708a2c73ed166de709e25380603e342))
* subtle combat effects (muzzle flash, explosion, death puff) ([#265](https://github.com/itay28/Military-TD/issues/265)) ([f71be51](https://github.com/itay28/Military-TD/commit/f71be513830093503ace2ada6ed12662ec4a4c56))
* tower sprites with turret rotation ([#266](https://github.com/itay28/Military-TD/issues/266)) ([f051b39](https://github.com/itay28/Military-TD/commit/f051b39d3e62d62971ee17b9ed5b6fac7f793814))


### Bug Fixes

* debounce Board sync and PR steward, meter API use, fail soft on the rate limit ([#294](https://github.com/itay28/Military-TD/issues/294)) ([3c5787b](https://github.com/itay28/Military-TD/commit/3c5787bfa3763b30df1731253811f0d57ee736a1))
* deselect a build-bar tower you can no longer afford ([#300](https://github.com/itay28/Military-TD/issues/300)) ([acbec2a](https://github.com/itay28/Military-TD/commit/acbec2aa4ae1cf39f33ba2937ad6175b9044e6d1))
* End screen opens at the top and shows when it scrolls ([#280](https://github.com/itay28/Military-TD/issues/280)) ([1cb3752](https://github.com/itay28/Military-TD/commit/1cb3752806aa8b04047672a091d3aa44ba2dadd4))
* HUD buttons keep their place when texts appear, grow or clear ([#277](https://github.com/itay28/Military-TD/issues/277)) ([5c7b057](https://github.com/itay28/Military-TD/commit/5c7b057c56b33a12df3eb817c0711b3e0420ac7c))
* PR steward compares conflicts against the base branch's tip ([#297](https://github.com/itay28/Military-TD/issues/297)) ([6ce2a06](https://github.com/itay28/Military-TD/commit/6ce2a06110b7d5994b6f6ea02d572347582c3206))

## [0.3.0](https://github.com/itay28/Military-TD/compare/v0.2.0...v0.3.0) (2026-10-27)


### Features

* auto-start waves option ([#251](https://github.com/itay28/Military-TD/issues/251)) ([4b2ef7b](https://github.com/itay28/Military-TD/commit/4b2ef7bde4b329b8793cd90b5237fa6ba25a5d54))
* drag to place a tower on touch ([#250](https://github.com/itay28/Military-TD/issues/250)) ([9615cf7](https://github.com/itay28/Military-TD/commit/9615cf743aa0c8ab761e6fa1451b699ff846c799))
* End screen damage report ([#234](https://github.com/itay28/Military-TD/issues/234)) ([eab9bbd](https://github.com/itay28/Military-TD/commit/eab9bbd821cb3b6c3cb461a4930ddf1ce43318b0))
* game speed toggle (×1 / ×2 / ×4) ([#231](https://github.com/itay28/Military-TD/issues/231)) ([db162eb](https://github.com/itay28/Military-TD/commit/db162eb2d63be73aa194147890d91b413da48d8f))
* level select screen ([#236](https://github.com/itay28/Military-TD/issues/236)) ([afb27b2](https://github.com/itay28/Military-TD/commit/afb27b25c7fc71dddbbe8bfbfbd1f0348abb5df7))
* main menu scene ([#233](https://github.com/itay28/Military-TD/issues/233)) ([2b21f19](https://github.com/itay28/Military-TD/commit/2b21f195cc92b4be14735ca23d38bf96bebcd0a9))
* pause menu (resume, restart, quit) ([#235](https://github.com/itay28/Military-TD/issues/235)) ([436a28a](https://github.com/itay28/Military-TD/commit/436a28a6aa1ec6b629eb61ade1197bbadc2f05f7))
* persist settings in localStorage ([#263](https://github.com/itay28/Military-TD/issues/263)) ([5a53fc8](https://github.com/itay28/Military-TD/commit/5a53fc8be250546eef089ab294b50d3ead140cc2))
* Settings screen (default game speed, always show tower ranges) ([#262](https://github.com/itay28/Military-TD/issues/262)) ([a772d03](https://github.com/itay28/Military-TD/commit/a772d0304d1ea9809b6c9e7c7be0942a2be6101e))


### Bug Fixes

* Board sync leaves a card alone once its PR merged into main ([#259](https://github.com/itay28/Military-TD/issues/259)) ([2f75618](https://github.com/itay28/Military-TD/commit/2f756180bc00047d63434758411b3b22067d638d))
* PR title check never leaves a cancelled run on a PR ([#261](https://github.com/itay28/Military-TD/issues/261)) ([ef37352](https://github.com/itay28/Military-TD/commit/ef373524dbd1b81feecda2a6c0116363dc8296e0))


### Miscellaneous Chores

* release 0.3.0 ([#270](https://github.com/itay28/Military-TD/issues/270)) ([4335b07](https://github.com/itay28/Military-TD/commit/4335b077a106fe0ed280fe39d63a2b654223ba36))

## [0.2.0](https://github.com/itay28/Military-TD/compare/v0.1.4...v0.2.0) (2026-10-27)


### Bug Fixes

* build bar icons match each tower's shape on the map ([#247](https://github.com/itay28/Military-TD/issues/247)) ([0fa8e8c](https://github.com/itay28/Military-TD/commit/0fa8e8c7a0230285f9ec0dfc085255aff1bc64b2))
* tower panel content fits its box on every screen ([#248](https://github.com/itay28/Military-TD/issues/248)) ([01d50f6](https://github.com/itay28/Military-TD/commit/01d50f69cba69877c88f520b428196460cacce10))


### Miscellaneous Chores

* release 0.2.0 ([#252](https://github.com/itay28/Military-TD/issues/252)) ([d2829e5](https://github.com/itay28/Military-TD/commit/d2829e554380e12b1a958f130ce5301d7869f283))

## [0.1.4](https://github.com/itay28/Military-TD/compare/v0.1.3...v0.1.4) (2026-10-27)


### Features

* 10-wave schedule that introduces each enemy slowly ([#182](https://github.com/itay28/Military-TD/issues/182)) ([e6a500e](https://github.com/itay28/Military-TD/commit/e6a500e26f8ebff5aa3936123edfcfca71e3a55f))
* AA Gun tower that hits only air ([#151](https://github.com/itay28/Military-TD/issues/151)) ([ad9d889](https://github.com/itay28/Military-TD/commit/ad9d8892682e8ef85cfdb1f53b1797c855dae7d2))
* **auto-start:** infra issues need no milestone; the sizing agent sets game milestones ([#228](https://github.com/itay28/Military-TD/issues/228)) ([68b0d88](https://github.com/itay28/Military-TD/commit/68b0d883b2308fc1ddc5f91741a9f87500ddcfe1))
* balance pass with counter matrix test and scenario bots ([#232](https://github.com/itay28/Military-TD/issues/232)) ([7562aa8](https://github.com/itay28/Military-TD/commit/7562aa836ba60ee9ea749dc45beead3b477d72d0))
* **board-sync:** warn when the pipeline is starved ([#229](https://github.com/itay28/Military-TD/issues/229)) ([0358d95](https://github.com/itay28/Military-TD/commit/0358d958d4951f37450f2f4d6fea59dfdfac7575))
* fit any screen, pan and zoom the map, collapsible build bar ([#192](https://github.com/itay28/Military-TD/issues/192)) ([34ef50b](https://github.com/itay28/Military-TD/commit/34ef50ba0034e2fef66e637ab0844d933ab49dd3))
* live DPS meter for the current wave ([#152](https://github.com/itay28/Military-TD/issues/152)) ([607acf0](https://github.com/itay28/Military-TD/commit/607acf052eee787c56775880f665cc3317c11cde))
* Mortar tower with a minimum range ([#153](https://github.com/itay28/Military-TD/issues/153)) ([3fed5fc](https://github.com/itay28/Military-TD/commit/3fed5fcf893f1f6560a2ad96cb22bbc234601bd3))
* PRs that touch critical paths wait for the maintainer's /approve ([#208](https://github.com/itay28/Military-TD/issues/208)) ([1fb89cd](https://github.com/itay28/Military-TD/commit/1fb89cd4533a17059df1cfe710601d5f15522c66))
* sell towers for a 70% refund ([#156](https://github.com/itay28/Military-TD/issues/156)) ([f687362](https://github.com/itay28/Military-TD/commit/f6873620ed294b01df8ccfc21b0db8eb40fc22a2))
* Size, Priority and Area set by label; a sizing agent sizes unsized issues ([#211](https://github.com/itay28/Military-TD/issues/211)) ([af239d8](https://github.com/itay28/Military-TD/commit/af239d8759c3b25c81963df879194f03b50f7f81))
* steward ships milestone releases only and merges the report PR ([#188](https://github.com/itay28/Military-TD/issues/188)) ([4e3149f](https://github.com/itay28/Military-TD/commit/4e3149f7180b1406fb9703150f1c71d6c168e916))
* **steward:** merge nothing but the fix while CI on main is red ([#223](https://github.com/itay28/Military-TD/issues/223)) ([9ffd670](https://github.com/itay28/Military-TD/commit/9ffd6709cb9167bec61a3d797dba40095b0fd860))


### Bug Fixes

* auto-start fires a dead implement session again instead of leaving it claimed ([#213](https://github.com/itay28/Military-TD/issues/213)) ([7af3c12](https://github.com/itay28/Military-TD/commit/7af3c12b7c2ff1be2a3a238b42289fe41079b4c1))
* out-of-tokens sessions retry uncounted; setup errors hand off loudly ([#202](https://github.com/itay28/Military-TD/issues/202)) ([ffecf2f](https://github.com/itay28/Military-TD/commit/ffecf2fef1fd493beec1a6384ee1b490a64fd15a))
* steward never counts conflict rounds; an unresolved conflict hands off ([#191](https://github.com/itay28/Military-TD/issues/191)) ([67775b5](https://github.com/itay28/Military-TD/commit/67775b5b0197c600bf3d9b4bc57f696179f45e89)), closes [#193](https://github.com/itay28/Military-TD/issues/193)
* steward requests a CI review that never ran ([#210](https://github.com/itay28/Military-TD/issues/210)) ([0e64d99](https://github.com/itay28/Military-TD/commit/0e64d9999fce38dcbde8331fd9307e724d4065c7))
* steward retries a dead round after 1 hour, not 3 ([#197](https://github.com/itay28/Military-TD/issues/197)) ([4c73fa9](https://github.com/itay28/Military-TD/commit/4c73fa9ae438a1c26abfe84894012be6347371d0))
* update-snapshots renders the PR merged with its base, as e2e does ([#199](https://github.com/itay28/Military-TD/issues/199)) ([65a9e9c](https://github.com/itay28/Military-TD/commit/65a9e9cba663cf4fd7bc391b79fb6cf581c931ba))

## [0.1.3](https://github.com/itay28/Military-TD/compare/v0.1.2...v0.1.3) (2026-10-26)


### Bug Fixes

* steward doesn't count rounds spent on conflicts from a moved base ([#184](https://github.com/itay28/Military-TD/issues/184)) ([1e1ecaf](https://github.com/itay28/Military-TD/commit/1e1ecaf35438404fedeff5af2a9cdbef21ef7845))

## [0.1.2](https://github.com/itay28/Military-TD/compare/v0.1.1...v0.1.2) (2026-10-26)


### Features

* tower upgrades (optics, heavier weapon) ([#155](https://github.com/itay28/Military-TD/issues/155)) ([a5e198c](https://github.com/itay28/Military-TD/commit/a5e198c35a0e62d3a6805e36f16fd87ec3dbd44f))

## [0.1.1](https://github.com/itay28/Military-TD/compare/v0.1.0...v0.1.1) (2026-10-26)


### Features

* armor, armor pierce and air/ground targeting ([#142](https://github.com/itay28/Military-TD/issues/142)) ([6e9c36c](https://github.com/itay28/Military-TD/commit/6e9c36cfb3e6c756290b6646c4d133d286a80ed5))
* auto-start cloud agents for Ready and stackable issues ([#172](https://github.com/itay28/Military-TD/issues/172)) ([9b78bf7](https://github.com/itay28/Military-TD/commit/9b78bf7aaff4e420d68efdfb28bc5a1bef4bfbed))
* Cannon anti-tank tower ([#146](https://github.com/itay28/Military-TD/issues/146)) ([e24d71c](https://github.com/itay28/Military-TD/commit/e24d71c8501a98e9e8c17d7114a6f9b31e68c7f3))
* cloud sessions check repo access and get the workflow skills ([#176](https://github.com/itay28/Military-TD/issues/176)) ([cc2ccef](https://github.com/itay28/Military-TD/commit/cc2ccefd5ea9e31954244d183f7b897131480b68))
* Helicopter air enemy ([#149](https://github.com/itay28/Military-TD/issues/149)) ([c909a24](https://github.com/itay28/Military-TD/commit/c909a249dd0965fcae6bfdcbfc44d9197b6fe618))
* Jeep enemy (fast, light) ([#147](https://github.com/itay28/Military-TD/issues/147)) ([0c74110](https://github.com/itay28/Military-TD/commit/0c7411038c66e7eca4bdbe1a7d0bf32eee84f96f))
* per-tower and overall damage and kill stats ([#145](https://github.com/itay28/Military-TD/issues/145)) ([55bbeaa](https://github.com/itay28/Military-TD/commit/55bbeaaee1514c4b87bd68ead2b225174b7bcfa5))
* PR steward fixes, refreshes and merges open PRs ([#174](https://github.com/itay28/Military-TD/issues/174)) ([2a00e1c](https://github.com/itay28/Military-TD/commit/2a00e1ca3bc8db0fe8f28fa0f8742132b7595282))
* shells with flight time and two-ring splash ([#150](https://github.com/itay28/Military-TD/issues/150)) ([2cc62c9](https://github.com/itay28/Military-TD/commit/2cc62c9264f5348f8acf35a65aeef93a655af887))
* steward ignores superseded checks and holds next-milestone merges ([#181](https://github.com/itay28/Military-TD/issues/181)) ([4760ea6](https://github.com/itay28/Military-TD/commit/4760ea669172f1d8d8c9678d3422c91b16d9ca7b))
* Tank enemy ([#148](https://github.com/itay28/Military-TD/issues/148)) ([821a29f](https://github.com/itay28/Military-TD/commit/821a29f459b2f2a5484d3ba639741c794971886b))
* tower build bar ([#143](https://github.com/itay28/Military-TD/issues/143)) ([a0a6815](https://github.com/itay28/Military-TD/commit/a0a68155ccc88a9fb54fc5e72c227ff2218930e3))
* tower info panel for a selected tower ([#154](https://github.com/itay28/Military-TD/issues/154)) ([98f6080](https://github.com/itay28/Military-TD/commit/98f60803302a6b6bd2df6863a68f8773aea7fb09))
* waves with several enemy groups ([#141](https://github.com/itay28/Military-TD/issues/141)) ([549d322](https://github.com/itay28/Military-TD/commit/549d322a5ed53d302c97f762f58857098d425a33))

## 0.1.0 (2026-10-25)


### Features

* economy and tower placement ([#119](https://github.com/itay28/Military-TD/issues/119)) ([1664bed](https://github.com/itay28/Military-TD/commit/1664bed2ce91ce6e0d50270b52067f4ee364ea6f))
* end screen with Victory/Defeat and Restart ([#129](https://github.com/itay28/Military-TD/issues/129)) ([e230d98](https://github.com/itay28/Military-TD/commit/e230d98ed0003040ef39d3ddc4dab6c8e7ffd3f4))
* enemy movement along the Path and leaking ([#94](https://github.com/itay28/Military-TD/issues/94)) ([35f535a](https://github.com/itay28/Military-TD/commit/35f535acca0f05d9f85e2141ec927029b428fe6c))
* game scene with fixed-timestep loop ([#93](https://github.com/itay28/Military-TD/issues/93)) ([2f62bc8](https://github.com/itay28/Military-TD/commit/2f62bc89b869af2960543edeabbcc380b8ea9e9a))
* headless scenario runner for fast sim tests ([#130](https://github.com/itay28/Military-TD/issues/130)) ([c74083e](https://github.com/itay28/Military-TD/commit/c74083ee2ac95b62abf9910d1b9b3b3e9632de08))
* HUD with money, lives, wave counter and Start Wave ([#121](https://github.com/itay28/Military-TD/issues/121)) ([ded6d2f](https://github.com/itay28/Military-TD/commit/ded6d2f330db216e67aaa53ab94218da2a7d98a7))
* place towers with the mouse ([#128](https://github.com/itay28/Military-TD/issues/128)) ([b666c8e](https://github.com/itay28/Military-TD/commit/b666c8e64986eb4e69c0e928aca6965ad55a82a7))
* Playwright UI test harness with test mode flags ([#133](https://github.com/itay28/Military-TD/issues/133)) ([2a07abf](https://github.com/itay28/Military-TD/commit/2a07abf7205a7c8928aa791b9255ec28adcdbafa))
* render enemies, towers and tracers ([#120](https://github.com/itay28/Military-TD/issues/120)) ([959b9e6](https://github.com/itay28/Military-TD/commit/959b9e6b154e73e0f96486e02b441b3e8de11640))
* scaffold Vite + TypeScript + Phaser 4 project ([#89](https://github.com/itay28/Military-TD/issues/89)) ([9f93024](https://github.com/itay28/Military-TD/commit/9f93024db892ba9a3b6db17126c98c86ddfc943b))
* sim map and Path model ([#91](https://github.com/itay28/Military-TD/issues/91)) ([fb65e58](https://github.com/itay28/Military-TD/commit/fb65e58c91258d6893ec1efa4d1b07f2d9c4ea95))
* tower targeting and firing ([#113](https://github.com/itay28/Military-TD/issues/113)) ([34aaf8f](https://github.com/itay28/Military-TD/commit/34aaf8fb928f0bda1b371627d9af6130e462c45b))
* waves, game phases, victory and defeat ([#114](https://github.com/itay28/Military-TD/issues/114)) ([81d0fc9](https://github.com/itay28/Military-TD/commit/81d0fc9dc90589dc89b51d59f470d3c189aa9d3c))


### Bug Fixes

* drop the release-as guard test that fails the release PR ([#159](https://github.com/itay28/Military-TD/issues/159)) ([30598d9](https://github.com/itay28/Military-TD/commit/30598d9b99e83230d1d810ec3a4ccf21e15e0c03))
* pin the 0.1.0 release with release-as ([#158](https://github.com/itay28/Military-TD/issues/158)) ([fab8635](https://github.com/itay28/Military-TD/commit/fab863560f6b80db436798e46eebe0bb8488ed80))
