import '@testing-library/jest-dom'

// Mock localStorage for node/jsdom test runner if missing
if (typeof window !== 'undefined' && !window.localStorage) {
  const store: Record<string, string> = {}
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value.toString()
      },
      removeItem: (key: string) => {
        delete store[key]
      },
      clear: () => {
        for (const key in store) delete store[key]
      },
    },
    writable: true,
  })
}

