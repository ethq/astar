const createHeap = () => {
	let heap = {};
	heap.items = [];
	heap.currentItemCount = 0;
	
	// Heap is specialized for A*, e.g. we assume the items are nodes with .fCost and .hCost members
	heap.compare = (a, b) => {
		let diff = a.fCost - b.fCost;
		if (diff === 0) {
			diff = a.hCost - b.hCost;
			if (diff === 0) {
				return 0;
			}
		}
		
		return (diff > 0 ? 1 : -1);
	}
	
	heap.add = item => {
		item.heapIndex = heap.currentItemCount;
		heap.items[heap.currentItemCount] = item;
		heap.sortUp(item);
		heap.currentItemCount++;
	};
	
	heap.removeFirst = () => {
		const firstItem = heap.items[0];
		heap.currentItemCount--;
		heap.items[0] = heap.items[currentItemCount];
		heap.items[0].heapIndex = 0;
		heap.sortDown(heap.items[0]);
		
		return firstItem;
	};
	
	heap.updateItem = item => {
		heap.sortUp(item);
	};
	
	heap.contains = item => {
		return heap.items[item.heapIndex] === item;
	};
	
	heap.sortUp = item => {
		let parentIndex = (item.heapIndex-1)/2;
		
		while(true) {
			let parentItem = heap.items[parentIndex];
			if (heap.compare(item, parentItem) > 0) {
				heap.swap(item, parentItem);
			}
			else {
				break;
			}
			
			parentIndex = (item.heapIndex-1)/2;
		}
	};
	
	heap.swap = (a, b) => {
		heap.items[a.heapIndex] = a;
		heap.items[b.heapIndex] = b;
		const aIndex = a.heapIndex;
		a.heapIndex = b.heapIndex;
		b.heapIndex = aIndex;
	};
	
	heap.sortDown = item => {
		while(true) {
			let childLeftIndex = item.heapIndex*2 + 1;
			let childRightIndex = item.heapIndex*2 + 2;
			let swapIndex = 0;
			
			if (childLeftIndex < heap.currentItemCount) {
				swapIndex = childLeftIndex;
				
				if (childRightIndex < heap.currentItemCount) {
					if (heap.compare(heap.items[childLeftIndex], heap.items[childRightIndex]) < 0) {
						swapIndex = childRightIndex;
					}
				}
				
				if (heap.compare(item, heap.items[swapIndex]) < 0) {
					heap.swap(item, items[swapIndex]);
				}
				else {
					return;
				}
			}
			else {
				return;
			}
		}
	};
}