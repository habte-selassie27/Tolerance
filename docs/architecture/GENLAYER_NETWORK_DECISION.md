# GenLayer network decision

Tolerance uses **Studionet only** for current GenLayer development, testing, deployment and Phase 2D integration. Studionet is chain ID `61999` at `https://studio.genlayer.com/api`; it is a hosted, gasless, temporary development environment. Bradbury is explicitly deferred and is not a Phase 2C/2D gate. Asimov is out of scope. Localnet is optional debugging only.

Reusable code remains network-configurable. TypeScript imports `studionet` from `genlayer-js/chains` in the single module `genlayer/config/network.ts`; it does not reproduce vendor RPC or chain metadata. The installed `genlayer-js@1.1.8` export was runtime-checked on 2026-08-08 and returned chain ID `61999` and the hosted RPC above.

The eventual X Layer deployment must bind the actual Studionet Intelligent Contract chosen for the integrated environment. A future move to another GenLayer network requires an explicit product-owner instruction and configuration/deployment change, not protocol redesign.

Source: official [GenLayer networks documentation](https://docs.genlayer.com/developers/networks) and installed GenLayerJS chain export, retrieved/verified 2026-08-08.
