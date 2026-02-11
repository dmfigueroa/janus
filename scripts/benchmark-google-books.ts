import { searchBooks } from "../src/server/google-books";

// Mock fetch globally
// We need to define a mock response structure that matches what searchBooks expects
const mockResponse = {
  items: [
    {
      id: "1",
      volumeInfo: {
        title: "Mock Book",
        imageLinks: { thumbnail: "http://example.com/image.jpg" },
        publishedDate: "2023-01-01",
        averageRating: 4.5,
        description: "Mock Description",
      },
    },
  ],
  totalItems: 1,
};

const MOCK_DELAY = 100; // 100ms latency simulation

// Store original fetch just in case
const originalFetch = global.fetch;

// Override global fetch
global.fetch = async (input: RequestInfo | URL | string, init?: RequestInit): Promise<Response> => {
  const url = input.toString();
  // Check if it's a Google Books URL
  if (url.includes("googleapis.com/books")) {
    await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
    return {
      ok: true,
      json: async () => mockResponse,
    } as Response;
  }
  // Fallback (though likely not needed for this benchmark)
  return originalFetch ? originalFetch(input, init) : Promise.reject(new Error("Fetch not mocked"));
};

// Set env var required by searchBooks
process.env.GOOGLE_BOOKS_API_KEY = "mock-key";

async function runBenchmark() {
  console.log("Running benchmark...");
  const iterations = 10;

  const start = performance.now();

  // Call searchBooks multiple times with the same query
  for (let i = 0; i < iterations; i++) {
    await searchBooks("test query", 1);
  }

  const end = performance.now();
  const totalTime = end - start;
  const avgTime = totalTime / iterations;

  console.log(`Total time for ${iterations} calls: ${totalTime.toFixed(2)}ms`);
  console.log(`Average time per call: ${avgTime.toFixed(2)}ms`);
}

runBenchmark().catch(console.error);
