export interface Item {
  id: string
  name: string
}

export interface Store {
  list(): Item[]
  create(name: string): Item
}

/** In-memory store. Deliberately boring: it is not what the demo is about. */
export function createStore(seed: Item[] = []): Store {
  const items: Item[] = [...seed]
  let nextId = items.length + 1

  return {
    list: () => [...items],
    create(name) {
      const item: Item = { id: String(nextId++), name }
      items.push(item)
      return item
    },
  }
}
