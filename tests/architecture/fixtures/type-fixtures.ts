/**
 * Compile-time fixtures: branded ids and Seconds must not be swapped.
 * Loaded by tsconfig.architecture.json (`tsc --noEmit`).
 */

import { type ProviderId, type WireId, providerId, wireId } from "../../../src/ids.js";
import { type Seconds, seconds } from "../../../src/time.js";

declare function needsWire(id: WireId): void;
declare function needsTimeout(timeout: Seconds): void;

const provider: ProviderId = providerId("deutschepost");
const wire: WireId = wireId("internetmarke");

needsWire(wire);
// @ts-expect-error ProviderId is not assignable to WireId
needsWire(provider);

needsTimeout(seconds(30));
// @ts-expect-error a raw millisecond number is not Seconds
needsTimeout(30_000);
