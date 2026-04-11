<script lang="ts">
	import type { Snippet } from "svelte";

  let {
    icon,
    label,
    placeholder = "",
    value = $bindable(),
    class: className = "",
    type = "text",
    ...restProps
  }: {
    icon?: Snippet;
    label?: string;
    placeholder?: string;
    value: string;
    type?: string;
    class?: string;
  } = $props();
</script>

<label class="flex w-full gap-1 text-sm font-medium text-base-content {className}">
  {#if label}
    <span>{label}</span>
  {/if}
  <div class="relative flex-1 gap-1">
    {#if icon}
      <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        {@render icon()}
      </div>
    {/if}
    <input
      type={type}
      bind:value={value}
      placeholder={placeholder}
      class="block w-full rounded-md border border-base-content/20 bg-base-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50 {icon ? 'pl-9' : ''}"
      {...restProps}
    />
  </div>
</label>