import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

interface TreeNode { 
id: string; 
name: string; 
parentId: string | null;
}

interface CategoryTree { 
nodes: Record<string, TreeNode>; 
childrenOf: Record<string, string[]>;
}

const VERSION_KEY = 'category:tree:version';
const treeKey = (v: string) => `category:tree:v${v}`;
const TTL_SECONDS = 3600;

export class CategoryTreeService { 
constructor( 
private readonly prisma: PrismaClient, 
private readonly redis: Redis, 
) {} 

async invalidate(): Promise<void> { 
await this.redis.incr(VERSION_KEY); 
} 

private async load(): Promise<CategoryTree> { 
const version = (await this.redis.get(VERSION_KEY)) ?? '0'; 
const cached = await this.redis.get(treeKey(version)); 
if (cached) return JSON.parse(cached) as CategoryTree; 

const rows = await this.prisma.category.findMany({ 
select: { id: true, name: true, parentId: true }, 
}); 

const tree: CategoryTree = { nodes: {}, childrenOf: {} }; 
for (const r of rows) { 
const id = String(r.id); 
const parentId = r.parentId === null ? null : String(r.parentId); 
tree.nodes[id] = { id, name: r.name, parentId }; 
(tree.childrenOf[parentId ?? 'ROOT'] ??= []).push(id); 
} 

await this.redis.set(treeKey(version), JSON.stringify(tree), 'EX', TTL_SECONDS); 
return tree; 
} 

// Fallback to fetch data directly from DB if Redis is down 
private async loadResilient(): Promise<CategoryTree> { 
try { 
return await this.load(); 
} catch (err) { 
console.warn('redis unavailable, falling back to direct DB read'); 
const rows = await this.prisma.category.findMany({ 
select: { id: true, name: true, parentId: true }, 
}); 
const tree: CategoryTree = { nodes: {}, childrenOf: {} }; 
for (const r of rows) { 
const id = String(r.id); 
const parentId = r.parentId === null ? null : String(r.parentId); 
tree.nodes[id] = { id, name: r.name, parentId }; 
(tree.childrenOf[parentId ?? 'ROOT'] ??= []).push(id); 
} 
return tree; 
} 
} 

async descendantIds(rootCategoryId: string): Promise<string[]> { 
const tree = await this.loadResilient(); // Updated here 
if (!tree.nodes[rootCategoryId]) return []; 

const visited = new Set<string>(); 
const collected: string[] = []; 
const stack: string[] = [rootCategoryId]; 

while (stack.length > 0) { 
const current = stack.pop()!; 
if (visited.has(current)) continue; 
visited.add(current); 
collected.push(current); 

const children = tree.childrenOf[current] ?? []; 
for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]); 
} 

return collected; 
} 

async ancestorOf(categoryId: string): Promise<string | null> { 
const tree = await this.loadResilient(); // Updated here 
return tree.nodes[categoryId]?.parentId ?? null; 
}
}
