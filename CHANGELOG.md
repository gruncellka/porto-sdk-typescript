# Changelog

[Unreleased]

### Added

- `PortoStatus` as the normalized carrier status.
- `statuses.json` set-parity (contract only; no runtime JSON).
- Optional opaque, sanitized `providerRaw` on `PortoMark` and `TrackingStatus`.
- Deutsche Post live tracking only on the explicit `shipment` wire with a base URL. Internetmarke is not a tracking wire and does not invent `created`.
- `lastUpdate` is the latest carrier event time, while `statusChangedAt` marks the start of the current normalized status run.

### Changed

- Unknown native status codes remain unmapped; they are not coerced to `transit`, and there is no `UNKNOWN` member.
- Carrier event times preserve explicit offsets or zoneless local semantics through `occurredKind`; poll time never substitutes for carrier time.
- Tracking event identity prefers provider-native ids and sequences, and provider chronology owns event order.

### Deprecated

- `TrackingState`; use `PortoStatus`. The alias remains through 0.2.x.
- `trackStamp`; use the shipment tracking path when a tracking wire exists.

## 0.1.0

Initial release
