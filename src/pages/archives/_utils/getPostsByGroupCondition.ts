import type { CollectionEntry } from "astro:content";

type GroupKey = string | number | symbol;
type GroupFunction<T> = (item: T, index?: number) => GroupKey;

export function getPostsByGroupCondition(
  posts: CollectionEntry<"log">[],
  groupFunction: GroupFunction<CollectionEntry<"log">>
) {
  const result: Record<GroupKey, CollectionEntry<"log">[]> = {};

  for (let i = 0; i < posts.length; i++) {
    const item = posts[i];
    const groupKey = groupFunction(item, i);

    if (!result[groupKey]) {
      result[groupKey] = [];
    }

    result[groupKey].push(item);
  }

  return result;
}
