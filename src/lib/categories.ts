type CategoryData = {
  category: string;
  categories?: string[];
};

export function getPostCategories(data: CategoryData): string[] {
  return [...new Set(
    [data.category, ...(data.categories ?? [])]
      .map((category) => category.trim())
      .filter(Boolean)
  )];
}

export function getCategoryLabel(category: string): string {
  return category === 'JOURNAL' ? '회고' : category;
}
