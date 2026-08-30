# Placeholder posts on valkey.io

Every post below currently ships a placeholder banner (`/assets/media/featured/random-0N.webp`
or `default.webp`) on `valkey-io/valkey-io.github.io`. This table is the recommended theme for
each, so a maintainer can replace a placeholder without re-deciding what the post is about.

Two thirds of them are covered by themes that already exist. Adding a bespoke banner per post
would mean 40-odd near-duplicates, which is the thing the "check it is not a duplicate" rule in
the skill exists to prevent. New themes were only added where no existing theme says the right
thing.

To use one: copy `images/<theme>.webp` into the site's `static/assets/media/featured/` and set
`featured_image = "/assets/media/featured/<theme>.webp"` under `[extra]` in the post.

## Covered by an existing theme

| Post | Theme |
| --- | --- |
| `2024-04-12-hello-world` | `community` |
| `2024-04-16-valkey-7-2-5-out` | `release-version` (caption `7.2.5`) |
| `2024-04-26-modules-101` | `how-to` |
| `2024-05-24-may-roundup` | `community` |
| `2024-07-07-unlock-one-million-rps` | `performance` |
| `2024-07-31-valkey-8-0-0-rc1` | `release-version` (caption `8.0 RC1`) |
| `2024-08-29-valkey-memory-efficiency-8-0` | `memory-efficiency` |
| `2024-09-13-unlock-one-million-rps-part2` | `performance` |
| `2024-09-16-valkey-8-ga` | `release-version` (caption `8.0`) |
| `2025-03-28-new-hash-table` | `data-structures` |
| `2025-04-02-valkey-8-1-0-ga` | `release-version` (caption `8.1`) |
| `2025-04-27-valkey-modules-rust-sdk-updates` | `how-to` |
| `2025-05-14-upgrade-stories-vol1` | `community` |
| `2025-05-21-performance-optimization-methodology-for-valkey` | `performance` |
| `2025-09-11-valkey-investment-in-open-source` | `community` |
| `2025-09-30-hash-fields-expiration` | `data-structures` |
| `2025-10-15-properly-secure-your-valkey-deployment` | `security` |
| `2025-10-20-1-billion-rps` | `performance` |
| `2025-10-21-introducing-valkey-9` | `release-version` (caption `9.0`) |
| `2025-10-27-atomic-slot-migration` | `atomic-slot-migration` |
| `2026-04-23-valkey-at-laracon-india-2026` | `community` |
| `2026-06-24-secret-life-of-data` | `data-structures` |
| `2026-08-13-9.1-memory-efficiency` | `memory-efficiency` |
| `2026-08-25-what-is-valkey-benchmark` | `benchmarks` |
| `whats-new-june-2024` | `community` |

## Needed a new theme

One theme per subject, narrowed from 2-3 candidates in maintainer review. Three subjects still have no theme:
every candidate for fleet operations, release candidates and AZ affinity was rejected.

| Post | Subject | Theme |
| --- | --- | --- |
| `2024-06-27-using-bitnami-valkey-chart` | Deploying by chart into Kubernetes | `k8s-*` |
| `2024-11-21-testing-the-limits` | Valkey inside a very small resource envelope | `limits-*` |
| `2024-12-22-az-affinity-strategy` | Reading from the replica in your own availability zone | none yet, both candidates rejected |
| `2025-03-4-go-client-in-public-preview` | Client libraries: many languages, one protocol | `client-ports` |
| `2025-04-09-introducing-bloom-filters` | Hashing sets a handful of bits in a shared array | `bloom-bit-array` |
| `2025-06-13-introducing-valkey-search` | Nearest matches from an index, not a full scan | `search-vector-nearest` |
| `2025-06-23-valkey-bundle-one-stop-shop-for-low-latency-modern-applications` | One package carrying several modules | `bundle-*` |
| `2025-07-10-keyspace-save-the-date` | A dated event | `event-gather-ring` |
| `2025-08-04-valkey-swift` | Client libraries | `client-ports` |
| `2026-02-19-operational-lessons` | A fleet, not a server | none yet, both candidates rejected |
| `2026-03-10-valkey-search-1_2` | Search, secondary indexing | `search-field-index` |
| `2026-03-27-valkey-tooling-primitives` | Primitives composing into tools | `tooling-stack` |
| `2026-04-22-valkey-swift-1.0` | Client libraries | `client-ports` |
| `2026-04-28-on-release-candidates` | The checkpoint held open before GA | none yet, both candidates rejected |
| `2026-05-05-ai-agent-memory-with-valkey-and-mem0` | Agent memory, hot turns and recalled ones | `ai-agent-memory` |
| `2026-06-10-managing-connection-storms-in-valkey-at-scale` | A surge of simultaneous reconnects | `conn-storm-spike` |
| `2026-08-05-modern-ai-workloads-mapping-to-valkey` | One workload fanning out into several primitives | `workload-fanout` |
