// Shared "an action is in flight" indicator for buttons app-wide. Usage:
// <button disabled={pending} aria-busy={pending} className="btn ...">
//   {pending && <Spinner />}
//   Label
// </button>
// Pairs with .btn-spinner / .btn[aria-busy="true"] in app/chemmemo.css.
export function Spinner() {
  return <span className="btn-spinner" aria-hidden="true" />;
}
