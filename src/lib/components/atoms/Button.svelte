<script lang="ts">
  import { Button, type WithChildren } from "bits-ui";

  type Props = WithChildren<Button.RootProps> & {
    title: string;
    variant?: "primary" | "secondary" | "muted" | "destructive" | "outline" | "ghost" | "link";
    size?: "sm" | "md" | "lg" | "icon";
  };

  let {
    variant = "primary",
    size = "md",
    title,
    children,
    ...restProps
  }: Props = $props();

  const variantClasses = {
    primary: "bg-primary text-primary-content hover:bg-primary/90",
    secondary: "bg-secondary text-secondary-content hover:bg-secondary/80",
    muted: "bg-base-300 text-base-content hover:bg-base-content/10",
    destructive: "bg-error text-error-content hover:bg-error/90",
    outline: "ring ring-base-content/20 bg-transparent text-base-content hover:bg-base-300",
    ghost: "text-base-content bg-transparent hover:bg-base-300",
    link: "text-primary underline-offset-4 hover:underline",
  };

  const sizeClasses = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
    icon: "p-2",
  };
</script>

<Button.Root
  {...restProps}
  class="inline-flex items-center justify-center rounded-md font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent data-[state=open]:bg-base-100 {sizeClasses[size]} {variantClasses[variant]} {restProps.class}"
  title={title} aria-label={restProps["aria-label"] || title}
>
  {@render children?.()}
</Button.Root>

