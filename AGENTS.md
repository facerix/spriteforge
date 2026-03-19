# AGENTS.md

Agent-specific guidance. See [README.md](README.md) for project overview, architecture, and coding standards.

## Critical Patterns

### DataStore

```javascript
import DataStore from "/src/DataStore.js";

DataStore.addEventListener("change", (evt) => {
  const { changeType, items } = evt.detail;
  // changeType: "init" | "add" | "update" | "delete"
});

const items = DataStore.items;
DataStore.updateItem(item);
```

### DOM Creation

```javascript
import { h } from "/src/domUtils.js";

// Always use h() - never createElement directly
const el = h("div", { className: "foo", id: "123" }, [child1, child2]);

// h() doesn't allow inline dataset manipulation, do it using the JS APIs
el.dataset.id = "456";
```

### Web Components

- `/components/` directory
- Shadow DOM, `<style>` tag, kebab-case tags
- Register with `customElements.define()`

## Important Files

| File                          | Purpose                             |
| ----------------------------- | ----------------------------------- |
| `src/DataStore.js`            | Central data store (localStorage)   |
| `src/domUtils.js`             | `h()` helper, `isDevelopmentMode()` |
| `src/ServiceWorkerManager.js` | Service worker lifecycle            |
| `src/uuid.js`                 | UUID generation                     |
| `sw-core.js`                  | Shared service worker logic         |
| `sw.js`                       | Production service worker           |
| `sw-dev.js`                   | Development service worker          |

## Common Tasks

**Adding an item:** Create object → `DataStore.addItem()` → listen for "change" to re-render.

**Service Worker:** Automatically detects dev mode via `isDevelopmentMode()` in `domUtils.js`.

## Things to Avoid

1. ❌ Frameworks (React, Vue, etc.)
2. ❌ Using `createElement` (use `h()`)
3. ❌ Bypassing DataStore for data operations
4. ❌ Adding heavy dependencies without approval

## Testing

Use @Browser at `http://localhost:8080` (assume server is already running). Verify UI, interactions, console, service worker.

## Checklist

**Before:** Offline support? DataStore? Using `h()`?

**After:** `npm run format` → `npm run lint` → fix lint → test in browser
