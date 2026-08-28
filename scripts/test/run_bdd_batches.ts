#!/usr/bin/env node
/** CLI entry for @sdk BDD batch runner. */

import { main } from "../../tests/bdd/runner/runner.js";

main()
    .then((code) => {
        process.exitCode = code;
    })
    .catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    });
