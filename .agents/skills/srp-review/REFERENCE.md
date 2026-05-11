# SRP & Top-Down Readability Reference

## The Single Responsibility Principle (SRP)

### What is a "Responsibility"?

In the context of SRP, a responsibility is a **reason to change**. If a class has more than one reason to change, it has more than one responsibility.

**Examples of multiple responsibilities:**

- A `User` class that handles both business logic (validating email) and persistence (saving to DB).
- A component that both fetches data and defines the layout of that data.
- A utility function that parses a string _and_ formats it for display.

### Cohesion vs. Coupling

- **High Cohesion**: Elements within a module are closely related to the single responsibility.
- **Low Coupling**: The module has minimal dependencies on other modules' internals.

---

## Top-Down Readability (The Stepdown Rule)

### The TO Paragraph Pattern

Think of every function as a "TO" paragraph:

- **TO** execute `renderDashboard`, we first `fetchData`, then `validateResults`, and finally `renderCharts`.
- **TO** `fetchData`, we call the API and handle potential errors.
- **TO** `renderCharts`, we map the data to SVG coordinates.

### Layout Guidelines

1. **Public/Entry Points First**: The most important, highest-level functions should be at the top.
2. **Next Level Down**: Functions called by the entry points should follow immediately after.
3. **Internal Helpers Last**: Low-level implementation details (data transformations, regex, string manipulation) should be at the bottom.

---

## The "SRP Review" Checklist

### Module/File Level

- [ ] Does this file represent one cohesive concept?
- [ ] Are there unrelated exports?
- [ ] Is the filename representative of everything inside?

### Class Level

- [ ] Does the class have a clear "owner" for its data?
- [ ] Are there methods that don't use any of the class's state (should they be static or moved)?
- [ ] Can the class be split into a "data" part and a "logic" part?

### Method Level

- [ ] Does the method name accurately describe _everything_ it does?
- [ ] Does it mix different levels of abstraction (e.g., business logic and raw data manipulation)?
- [ ] Is it longer than 20 lines? (Long methods often hide multiple responsibilities).

---

## Example: Before & After

### Before (Mixed Responsibilities & Poor Readability)

```typescript
async function processOrder(orderId: string) {
  // Level 1: Fetching
  const response = await fetch(`/api/orders/${orderId}`);
  const data = await response.json();

  // Level 2: Business Logic
  if (data.status === "pending") {
    data.total = data.items.reduce((acc, item) => acc + item.price, 0);

    // Level 3: Formatting Detail
    const formattedTotal = `$${data.total.toFixed(2)}`;
    console.log(`Processing order for ${formattedTotal}`);

    // Level 1: Update
    await fetch(`/api/orders/${orderId}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
}
```

### After (SRP & Top-Down)

```typescript
async function processOrder(orderId: string) {
  const order = await fetchOrder(orderId);
  if (isPending(order)) {
    const processedOrder = calculateTotal(order);
    logOrderProcessing(processedOrder);
    await updateOrder(processedOrder);
  }
}

// Next level of abstraction
async function fetchOrder(id: string) { ... }
function isPending(order: Order) { ... }
function calculateTotal(order: Order) { ... }
async function updateOrder(order: Order) { ... }

// Lowest level: Implementation details
function formatCurrency(amount: number) { ... }
```
