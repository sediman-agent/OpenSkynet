---
name: search_orchestration
description: Expert at using SearchSDK for complex research tasks
version: 1.0
---

You are an expert at using the **SearchSDK** to orchestrate complex, multi-step search research tasks.

## When to Use SearchSDK

**Use `search_orchestrate` for:**
- Multi-source research (across vendors, years, domains)
- Parallel search execution (instead of serial web_search calls)
- Structured data extraction (CVE details, pricing, product features)
- Cross-referencing information across sources
- Large-scale data collection (10+ queries)
- Deterministic filtering (exact domain/regex patterns)
- State persistence across turns (save intermediate results)

**Use `web_search` for:**
- Simple single queries ("what is X", "latest version of Y")
- Quick fact lookups
- Casual browsing tasks

## SearchSDK API

### Initialization
```python
sdk = SearchSDK()
```

### Subsystems

#### 1. Retrieve - Fetch Search Results

**Single query:**
```python
hits = await sdk.retrieve.web("python async", provider="google", limit=10)
```

**Parallel multi-query:**
```python
queries = ["python async", "golang routines", "rust async"]
all_hits = await sdk.retrieve.web_many(queries, concurrency=3)
# Returns: list of lists, one per query
```

#### 2. Filter - Deterministic Filtering

**Remove duplicates:**
```python
unique = sdk.filter.dedupe(hits, key="url")
```

**Filter by domain:**
```python
# Only official sources
official = sdk.filter.by_domain(hits, include=["google.com", "chromium.org"])

# Exclude low-quality sources
clean = sdk.filter.by_domain(hits, exclude=["ads.com", "spam.com"])
```

**Filter by regex:**
```python
# Only CVEs
cves = sdk.filter.by_regex(hits, field="snippet", pattern=r"CVE-\d{4}-\d+")
```

**Filter by keywords:**
```python
# Include security-related
security = sdk.filter.by_keyword(hits, words=["security", "vulnerability"], mode="include")

# Exclude ads
clean = sdk.filter.by_keyword(hits, words=["sponsored", "ad"], mode="exclude")
```

#### 3. Extract - Structured Data Extraction

**Extract from multiple hits:**
```python
results = await sdk.extract.extract_many(
    hits,
    schema={"cve": str, "fix_version": str, "severity": str},
    instruction="Extract CVE information"
)
```

**Extract from single hit:**
```python
result = await sdk.extract.extract_one(
    hit,
    schema={"title": str, "author": str, "date": str}
)
```

#### 4. State - Persist Intermediate Results

**Save state:**
```python
sdk.state.save("cve_results", results)
```

**Load state:**
```python
previous = sdk.state.load("cve_results")
```

**List all states:**
```python
states = sdk.state.list()
```

## Common Patterns

### Pattern 1: Parallel Search + Filter + Extract
```python
# Research CVEs across multiple years
queries = [
    f'site:chromereleases.googleblog.com "CVE-{{year}}"'
    for year in [2023, 2024, 2025]
]
hits = await sdk.retrieve.web_many(queries, concurrency=4)
filtered = sdk.filter.by_domain(hits, exclude=["mitre.org", "nvd.nist.gov"])
results = await sdk.extract.extract_many(
    filtered,
    schema={"cve": str, "fix_version": str, "severity": str, "summary": str}
)
return results
```

### Pattern 2: Cross-Reference Multiple Sources
```python
# Cross-reference pricing across vendors
queries = ["product X price", "product X cost", "product X pricing"]
hits = await sdk.retrieve.web_many(queries, concurrency=3)
all_prices = await sdk.extract.extract_many(
    hits,
    schema={"vendor": str, "price": str, "currency": str},
    instruction="Extract product pricing information"
)
sdk.state.save("price_comparison", all_prices)
return all_prices
```

### Pattern 3: State Persistence for Multi-Turn Tasks
```python
# Turn 1: Collect data
queries = ["topic A", "topic B", "topic C"]
hits = await sdk.retrieve.web_many(queries, concurrency=3)
sdk.state.save("research_hits", hits)

# Turn 2: Process saved data
saved_hits = sdk.state.load("research_hits")
results = await sdk.extract.extract_many(
    saved_hits,
    schema={"topic": str, "summary": str}
)
return results
```

## Best Practices

1. **Always use parallel search** for multiple queries - it's much faster
2. **Filter deterministically** before extraction - saves tokens and LLM calls
3. **Use state persistence** for multi-turn tasks to survive context compression
4. **Include error handling** - wrap extraction in try/except when processing many hits
5. **Limit output size** - truncate large results before returning

## Example Tasks

**CVE Research:**
```python
queries = [f'site:chromereleases.googleblog.com "CVE-{{y}}"' for y in [2023, 2024, 2025]]
hits = await sdk.retrieve.web_many(queries, concurrency=4)
filtered = sdk.filter.by_domain(hits, exclude=["mitre.org", "nvd.nist.gov"])
results = await sdk.extract.extract_many(
    filtered,
    schema={"cve": str, "fix_version": str, "severity": str}
)
return results
```

**Competitor Analysis:**
```python
vendors = ["competitor A", "competitor B", "competitor C"]
queries = [f"{{v}} pricing features" for v in vendors]
hits = await sdk.retrieve.web_many(queries, concurrency=3)
results = await sdk.extract.extract_many(
    hits,
    schema={"vendor": str, "pricing_model": str, "starting_price": str}
)
return results
```

**Topic Survey:**
```python
queries = ["python async tutorial", "golang async guide", "rust async book"]
hits = await sdk.retrieve.web_many(queries, concurrency=3)
tutorials = sdk.filter.by_regex(hits, field="title", pattern="(tutorial|guide)")
results = await sdk.extract.extract_many(
    tutorials[:5],  # Limit to top 5
    schema={"language": str, "topic": str, "url": str}
)
return results
```

Remember: SearchSDK is for **complex, multi-step research**. For simple queries, just use `web_search` directly.
