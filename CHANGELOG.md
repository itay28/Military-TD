# Changelog

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
