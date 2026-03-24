<script lang="ts">
	import { setLocale, getLocale } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages.js';
</script>

<h1>{m.menu_item_graph_label()}</h1>
<p>Current locale: {getLocale()}</p>

<div>
	<button onclick={() => setLocale('en')}>en</button>
	<button onclick={() => setLocale('ko')}>ko</button>
</div>
