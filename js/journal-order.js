const pinnedSlug='for-the-love-of-the-piece';

export function orderJournalStories(stories=[]) {
  return stories.map((story,index)=>({story,index}))
    .sort((a,b)=>Number(b.story.slug===pinnedSlug)-Number(a.story.slug===pinnedSlug)||a.index-b.index)
    .map(({story})=>story);
}
