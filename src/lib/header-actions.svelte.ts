import { type Snippet } from 'svelte';

export class HeaderActions {
	actions: Snippet | null = $state(null);

	setActions(actions: Snippet | null) {
		this.actions = actions;
	}

	clear() {
		this.actions = null;
	}
}
