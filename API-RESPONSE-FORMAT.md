# API Response Format - Plagiarism Detection

## Overview

The `/api/check` endpoint now returns **independent results** from both detection methods, allowing the frontend to display them side-by-side without compromising either result.

## Response Structure

```json
{
  "success": true,
  
  // NEW: Individual detection verdicts (USE THIS IN FRONTEND)
  "detection_results": {
    "local": {
      "method": "Local Vector Similarity (Semantic)",
      "plagiarism_detected": true/false,
      "confidence": "high" | "medium" | "low" | "none",
      "max_similarity": 85,  // percentage (0-100)
      "matches_found": 3,
      "summary": "Found 3 similar submission(s). Highest similarity: 85%",
      "details": {
        "threshold_used": 75,
        "top_matches": [...],
        "similar_chunks": [...]
      }
    },
    "external": {
      "method": "External API (AST + Code Structure)",
      "plagiarism_detected": true/false,
      "confidence": "high" | "medium" | "low" | "very_low" | "unknown",
      "max_similarity": 90,  // percentage (0-100)
      "matches_found": 2,
      "summary": "External API detected 2 potential match(es)",
      "details": {
        "available": true,
        "summary": [...],
        "comparisons": [...]
      }
    }
  },
  
  // NEW: Overall assessment (combines both methods)
  "overall": {
    "status": "PLAGIARISM_DETECTED" | "NO_PLAGIARISM",
    "priority": "HIGH_PRIORITY" | "MEDIUM_PRIORITY" | "LOW_PRIORITY",
    "recommendation": "Review required - one or more detection methods flagged this submission",
    "methods_flagged": ["Local Vector Similarity", "External API Analysis"]
  },
  
  // Detailed data (for drill-down views)
  "local_result": { ... },
  "external_result": { ... },
  
  // Legacy fields (backward compatibility)
  "final_decision": { ... },
  "summary": { ... },
  "similarSubmissions": [ ... ],
  "similarChunks": [ ... ]
}
```

---

## Frontend Display Recommendations

### 1. **Side-by-Side Cards** (Recommended)

Display both detection methods independently:

```
┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│  🔍 Local Detection              │  │  🌐 External Detection          │
│                                  │  │                                  │
│  Status: ✅ DETECTED             │  │  Status: ✅ DETECTED             │
│  Confidence: HIGH (85%)          │  │  Confidence: HIGH (90%)          │
│  Matches: 3 similar submissions  │  │  Matches: 2 code patterns       │
│                                  │  │                                  │
│  [View Details →]                │  │  [View Details →]                │
└─────────────────────────────────┘  └─────────────────────────────────┘

Overall: ⚠️ PLAGIARISM DETECTED - Review Required
Priority: HIGH (Both methods flagged this submission)
```

### 2. **Alert Banner**

Show overall status prominently:

```javascript
if (response.overall.status === 'PLAGIARISM_DETECTED') {
  // Show red/yellow alert
  // Priority: response.overall.priority
  // Recommendation: response.overall.recommendation
}
```

### 3. **Detailed View**

When user clicks "View Details":
- **Local Details:** Show `detection_results.local.details.top_matches`
- **External Details:** Show `detection_results.external.details.comparisons`

---

## Example Scenarios

### Scenario 1: Both Methods Detect Plagiarism

```json
{
  "detection_results": {
    "local": {
      "plagiarism_detected": true,
      "confidence": "high",
      "max_similarity": 87,
      "summary": "Found 2 similar submissions. Highest similarity: 87%"
    },
    "external": {
      "plagiarism_detected": true,
      "confidence": "high",
      "max_similarity": 92,
      "summary": "External API detected 2 potential matches"
    }
  },
  "overall": {
    "status": "PLAGIARISM_DETECTED",
    "priority": "HIGH_PRIORITY",
    "methods_flagged": ["Local Vector Similarity", "External API Analysis"]
  }
}
```

**Frontend Action:** Show red alert, both cards show warnings

---

### Scenario 2: Only Local Detects (External Finds Nothing)

```json
{
  "detection_results": {
    "local": {
      "plagiarism_detected": true,
      "confidence": "high",
      "max_similarity": 85,
      "summary": "Found 3 similar submissions. Highest similarity: 85%"
    },
    "external": {
      "plagiarism_detected": false,
      "confidence": "low",
      "max_similarity": 15,
      "summary": "External API found no matches"
    }
  },
  "overall": {
    "status": "PLAGIARISM_DETECTED",
    "priority": "MEDIUM_PRIORITY",
    "methods_flagged": ["Local Vector Similarity"]
  }
}
```

**Frontend Action:** 
- Local card: Show warning ⚠️
- External card: Show pass ✅
- Overall: Yellow alert (review recommended)

---

### Scenario 3: Only External Detects (Local Finds Nothing)

```json
{
  "detection_results": {
    "local": {
      "plagiarism_detected": false,
      "confidence": "none",
      "max_similarity": 0,
      "matches_found": 0,
      "summary": "No similar submissions found in local database"
    },
    "external": {
      "plagiarism_detected": true,
      "confidence": "high",
      "max_similarity": 88,
      "summary": "External API detected 1 potential match"
    }
  },
  "overall": {
    "status": "PLAGIARISM_DETECTED",
    "priority": "MEDIUM_PRIORITY",
    "methods_flagged": ["External API Analysis"]
  }
}
```

**Frontend Action:** 
- Local card: Show pass ✅
- External card: Show warning ⚠️
- Overall: Yellow alert (review recommended - might be from external sources)

---

### Scenario 4: Both Methods Find Nothing

```json
{
  "detection_results": {
    "local": {
      "plagiarism_detected": false,
      "confidence": "none",
      "max_similarity": 0,
      "summary": "No similar submissions found"
    },
    "external": {
      "plagiarism_detected": false,
      "confidence": "very_low",
      "max_similarity": 5,
      "summary": "External API found no matches"
    }
  },
  "overall": {
    "status": "NO_PLAGIARISM",
    "priority": "LOW_PRIORITY",
    "methods_flagged": []
  }
}
```

**Frontend Action:** 
- Both cards: Show pass ✅
- Overall: Green/neutral - no action needed

---

### Scenario 5: External API Unavailable

```json
{
  "detection_results": {
    "local": {
      "plagiarism_detected": true,
      "confidence": "high",
      "max_similarity": 85,
      "summary": "Found 2 similar submissions"
    },
    "external": {
      "plagiarism_detected": false,
      "confidence": "unknown",
      "max_similarity": 0,
      "matches_found": 0,
      "summary": "External API unavailable: Connection timeout",
      "details": {
        "available": false,
        "error": "Connection timeout"
      }
    }
  },
  "overall": {
    "status": "PLAGIARISM_DETECTED",
    "priority": "MEDIUM_PRIORITY",
    "methods_flagged": ["Local Vector Similarity"]
  }
}
```

**Frontend Action:** 
- Local card: Show warning ⚠️
- External card: Show gray/disabled state with error message
- Overall: Decision based on local only

---

## Frontend Implementation Example (React)

```jsx
function PlagiarismResults({ response }) {
  const { detection_results, overall } = response;
  
  return (
    <div>
      {/* Overall Alert */}
      {overall.status === 'PLAGIARISM_DETECTED' && (
        <Alert severity={overall.priority === 'HIGH_PRIORITY' ? 'error' : 'warning'}>
          {overall.recommendation}
          <br />
          <strong>Flagged by:</strong> {overall.methods_flagged.join(', ')}
        </Alert>
      )}
      
      {/* Individual Results */}
      <Grid container spacing={2}>
        {/* Local Detection Card */}
        <Grid item xs={6}>
          <DetectionCard
            title="Local Detection (Semantic)"
            result={detection_results.local}
            icon="🔍"
          />
        </Grid>
        
        {/* External Detection Card */}
        <Grid item xs={6}>
          <DetectionCard
            title="External Detection (AST)"
            result={detection_results.external}
            icon="🌐"
          />
        </Grid>
      </Grid>
    </div>
  );
}

function DetectionCard({ title, result, icon }) {
  const getStatusColor = () => {
    if (!result.details?.available && result.method.includes('External')) {
      return 'gray'; // External API unavailable
    }
    return result.plagiarism_detected ? 'red' : 'green';
  };
  
  return (
    <Card style={{ borderColor: getStatusColor() }}>
      <CardHeader title={`${icon} ${title}`} />
      <CardContent>
        <Typography variant="h6">
          {result.plagiarism_detected ? '⚠️ DETECTED' : '✅ NO PLAGIARISM'}
        </Typography>
        <Typography>
          Confidence: {result.confidence.toUpperCase()}
        </Typography>
        <Typography>
          Max Similarity: {result.max_similarity}%
        </Typography>
        <Typography variant="body2" color="textSecondary">
          {result.summary}
        </Typography>
        {result.plagiarism_detected && (
          <Button onClick={() => showDetails(result.details)}>
            View Details →
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## Key Points

✅ **ALWAYS display both results independently** - don't let one override the other
✅ **Use `detection_results.local` and `detection_results.external`** for UI display
✅ **Show `overall` assessment** as a summary/recommendation only
✅ **Handle External API unavailability gracefully** - check `details.available`
✅ **Priority levels** help determine alert severity:
   - `HIGH_PRIORITY`: Both methods flagged → Red alert
   - `MEDIUM_PRIORITY`: One method flagged → Yellow alert
   - `LOW_PRIORITY`: No plagiarism → Green/neutral

❌ **DON'T compromise results** - if local says "no" but external says "yes", show both
❌ **DON'T hide information** - instructors should see the full picture

---

## Questions?

If you need clarification on any fields or want to add new data to the response, contact the backend team!
