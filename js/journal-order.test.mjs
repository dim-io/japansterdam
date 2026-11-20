import assert from 'node:assert/strict';
import test from 'node:test';
import {orderJournalStories} from './journal-order.js';

test('For the love of the piece is first while other Journal stories retain their order',()=>{
 const stories=[{slug:'out-of-the-kiln-into-the-everyday'},{slug:'for-the-love-of-the-piece'},{slug:'another-story'}];
 assert.deepEqual(orderJournalStories(stories).map(story=>story.slug),[
  'for-the-love-of-the-piece','out-of-the-kiln-into-the-everyday','another-story'
 ]);
 assert.deepEqual(orderJournalStories(stories.slice(0,1)),stories.slice(0,1));
});
