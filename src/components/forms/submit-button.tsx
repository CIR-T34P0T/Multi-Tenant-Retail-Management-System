import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** Submit button that shows progress and blocks double-submission. */
export function SubmitButton({
  pending,
  children,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { pending: boolean }) {
  return (
    <Button
      type="submit"
      disabled={pending || props.disabled}
      className={className ?? "h-11 md:h-9"}
      {...props}
    >
      {pending ? <Spinner /> : null}
      {children}
    </Button>
  );
}
