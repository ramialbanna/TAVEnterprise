# TAV Marketplace --- Enterprise Vehicle Sourcing Platform Spec v1.0

## Table of Contents

1.  Executive Truth
2.  Product Mission
3.  Business Objective
4.  Scope Clarification
5.  Architecture Overview
6.  Data Model
7.  Stale Listing Strategy
8.  VIN Reality
9.  Deduplication
10. Multi-Platform Ingestion
11. Worker Design
12. Database Model
13. Buy-Box Engine
14. Scoring Engine
15. Lead Workflow
16. Assignment Strategy
17. Operator Interface
18. Reporting
19. Reliability
20. Security
21. Performance
22. Cost Strategy
23. Data Feedback Loop
24. 2026 Data Import
25. Build Phases
26. Non-Goals
27. Core Design Corrections
28. Final Assessment

------------------------------------------------------------------------

## 1. Executive Truth

Your 4-region Facebook setup is a proof-of-concept ingest lane, not the
full system.

This system is a national, multi-platform acquisition engine.

------------------------------------------------------------------------

## 2. Product Mission

Ingest → Normalize → Deduplicate → Enrich → Score → Route → Learn

------------------------------------------------------------------------

## 3. Business Objective

More supply + faster decisions + better filtering + feedback loop.

------------------------------------------------------------------------

## 4. Scope Clarification

MVP: Facebook + 4 regions\
Enterprise: Multi-platform + national + 100+ buyers

------------------------------------------------------------------------

## 5. Architecture Overview

Scrapers → Worker → Normalize → Identity → Stale Filter → Score → DB →
Lead Queue

------------------------------------------------------------------------

## 6. Data Model

Raw Listings → Normalized Listings → Vehicle Candidates → Leads

------------------------------------------------------------------------

## 7. Stale Listing Strategy

Freshness scoring + buyer feedback + suppression

------------------------------------------------------------------------

## 8. VIN Reality

Facebook = no VIN → rely on YMM + mileage

------------------------------------------------------------------------

## 9. Deduplication

Exact + fuzzy grouping

------------------------------------------------------------------------

## 10. Multi-Platform Ingestion

Adapters per source

------------------------------------------------------------------------

## 11. Worker Design

Modular TypeScript structure

------------------------------------------------------------------------

## 12. Database Model

Core tables: - raw_listings - normalized_listings - vehicle_candidates -
leads - purchase_outcomes

------------------------------------------------------------------------

## 13. Buy-Box Engine

Driven by 2026 purchase data

------------------------------------------------------------------------

## 14. Scoring Engine

Price vs MMR + buy-box + freshness + region

------------------------------------------------------------------------

## 15. Lead Workflow

Assignment, locking, status tracking

------------------------------------------------------------------------

## 16. Assignment Strategy

Region + priority + load balancing

------------------------------------------------------------------------

## 17. Operator Interface

Dashboard replacing AppSheet at scale

------------------------------------------------------------------------

## 18. Reporting

Conversion, profit, source performance

------------------------------------------------------------------------

## 19. Reliability

Retry, DLQ, alerts, monitoring

------------------------------------------------------------------------

## 20. Security

Secrets, auth, roles, audit logs

------------------------------------------------------------------------

## 21. Performance

Batch ingestion, indexing, caching

------------------------------------------------------------------------

## 22. Cost Strategy

Reduce Make, cache MMR, optimize sync

------------------------------------------------------------------------

## 23. Data Feedback Loop

Purchases → improve scoring

------------------------------------------------------------------------

## 24. 2026 Data Import

Foundation for buy-box rules

------------------------------------------------------------------------

## 25. Build Phases

1.  MVP
2.  Production MVP
3.  Expansion
4.  Multi-platform
5.  Enterprise
6.  Intelligence

------------------------------------------------------------------------

## 26. Non-Goals

No ML early, no overengineering

------------------------------------------------------------------------

## 27. Core Design Corrections

Separate listing vs vehicle vs lead\
Stale detection is core\
Buy-box from real data

------------------------------------------------------------------------

## 28. Final Assessment

Build small, design big, scale intentionally.
