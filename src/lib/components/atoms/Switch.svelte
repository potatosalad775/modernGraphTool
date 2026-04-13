<script lang="ts">
  import { Switch, Label, useId, type WithoutChildrenOrChild } from "bits-ui";
 
  let {
    id = useId(),
    checked = $bindable(false),
    ref = $bindable(null),
    labelText,
    labelClass = "",
    size = "md",
    variant = "accent",
    ...restProps
  }: WithoutChildrenOrChild<Switch.RootProps> & {
    labelText?: string | undefined;
    labelClass?: string;
    size?: "sm" | "md" | "lg";
    variant?: "accent" | "muted";
  } = $props();

  const sizeClasses = {
    sm: "h-5 w-9",
    md: "h-6 w-11",
    lg: "h-7 w-14",
  } as const;

  const thumbSizeClasses = {
    sm: "size-3.5 data-[state=checked]:translate-x-4",
    md: "size-[18px] data-[state=checked]:translate-x-5",
    lg: "size-[22px] data-[state=checked]:translate-x-7",
  } as const;

  const variantRootClasses = {
    accent: "focus-visible:ring-accent focus-visible:ring-offset-base-100 data-[state=checked]:bg-primary data-[state=unchecked]:bg-base-content/20",
    muted: "focus-visible:ring-base-content focus-visible:ring-offset-base-100 data-[state=checked]:bg-base-content/80 data-[state=unchecked]:bg-base-content/20",
  } as const;

  const variantThumbClasses = {
    accent: "data-[state=checked]:bg-primary-content data-[state=unchecked]:bg-white",
    muted: "data-[state=checked]:bg-base-100 data-[state=unchecked]:bg-white",
  } as const;
</script>

<div class="flex items-center space-x-2">
  <Switch.Root
    bind:checked bind:ref {id}
    class="peer inline-flex shrink-0 cursor-pointer items-center rounded-full px-0.75 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 data-[state=unchecked]:shadow-inner disabled:cursor-not-allowed disabled:opacity-50 {sizeClasses[size]} {variantRootClasses[variant]} {restProps.class}"
    {...restProps}
  >
    <Switch.Thumb
      class="pointer-events-none block shrink-0 rounded-full shadow-sm transition-transform data-[state=unchecked]:translate-x-0 {thumbSizeClasses[size]} {variantThumbClasses[variant]}"
    />
  </Switch.Root>
  {#if labelText}
    <Label.Root for={id} class="text-sm font-medium {labelClass}">{labelText}</Label.Root>
  {/if}
</div>
