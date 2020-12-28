// Comparator takes two elements (a, b) and returns 
// -1 if a < b
//  0 if a = b
//  1 if a > b

export default class MinHeap {
	constructor(comparator) {
		this.items = [];
		this.compare = comparator;
	}
	
	parent = i => Math.floor((i-1)/2);
	left = i => 2*i + 1;
	right = i => 2*i + 2;
	
	heapify_down = i => {
		const left = this.left(i);
		const right = this.right(i);
		
		let smallest = i;
		if (left < this.size() && this.compare(this.items[left], this.items[smallest]) < 0) {
			smallest = left;
		}
		
		if (right < this.size() && this.compare(this.items[right], this.items[smallest]) < 0) {
			smallest = right;
		}
		
		if (smallest !== i) {
			this.swap(i, smallest);
			this.heapify_down(smallest);
		}
	};
	
	heapify_up = i => {
		if (i && this.compare(this.items[this.parent(i)], this.items[i]) > 0) {
			this.swap(i, this.parent(i));
			this.heapify_up(this.parent(i))
		}
	};
	
	// Swaps items at indices (i, j)
	swap = (i, j) => {
		let tmp = this.items[i];
		this.items[i] = this.items[j];
		this.items[j] = tmp;
	};
	
	find = condition => this.items.find(condition);
	
	// Intended public methods
	size = () => this.items.length;
	empty = () => this.items.length === 0;
	
	// Add item to heap
	push = item => {
		this.items.push(item);
		const lastIndex = this.size() - 1;
		this.heapify_up(lastIndex);
	};
	
	// Remove & return top node
	pop = () => {
		if (this.size() === 0) return null;
		const topItem = this.items[0];
		this.items[0] = this.items.pop();
		this.heapify_down(0);
		
		return topItem;
	};
	
	// Get top node
	top = () => {
		if (this.size() === 0) return null; // Or throw an error..
		return this.items[0];
	};
};