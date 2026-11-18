// T3's code imports "gt-react"; Studio's build resolves that to this module (`apps/web/vite/brand.ts`),
// and this module's own "gt-react" import is the real package.
import {
  decodeOptions,
  gtFallback as realGtFallback,
  mFallback as realMFallback,
  T as RealT,
  useGT as useT3GT,
  type useMessages as realUseMessages,
  Var,
} from "gt-react";
import {
  cloneElement,
  createElement,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";

import { brandCopy, namesT3 } from "./brandCopy";

export * from "gt-react";

type GTFunction = ReturnType<typeof useT3GT>;
type MessagesFunction = (
  message: string | null | undefined,
  options?: Parameters<GTFunction>[1],
) => string | null | undefined;

export const gtFallback: typeof realGtFallback = (message, options) =>
  realGtFallback(typeof message === "string" ? brandCopy(message) : message, options);

export const mFallback = ((message, options) => {
  if (typeof message !== "string" || !namesT3(message)) return realMFallback(message, options);
  const decoded = decodeOptions(message);
  return typeof decoded?.$_source === "string"
    ? realGtFallback(brandCopy(decoded.$_source), decoded)
    : realGtFallback(brandCopy(message), options);
}) as typeof realMFallback;

export function useGT(...args: Parameters<typeof useT3GT>): GTFunction {
  const gt = useT3GT(...args);
  const branded: GTFunction = (message, options) => gt(brandCopy(message), options);
  return branded;
}

// gt-react's own useMessages, over the useGT above.
export function useMessages(...args: Parameters<typeof useT3GT>) {
  const gt = useGT(...args);
  const messages: MessagesFunction = (message, options = {}) => {
    if (message == null) return message;
    const decoded = decodeOptions(message);
    return typeof decoded?.$_source === "string"
      ? gt(decoded.$_source, decoded)
      : gt(message, options);
  };
  return messages as ReturnType<typeof realUseMessages>;
}

const hasT3Text = (node: ReactNode): boolean => {
  if (typeof node === "string") return namesT3(node);
  if (Array.isArray(node)) return node.some(hasT3Text);
  if (!isValidElement<{ children?: ReactNode }>(node) || node.type === Var) return false;
  return hasT3Text(node.props.children);
};

const brandNode = (node: ReactNode): ReactNode => {
  if (typeof node === "string") return brandCopy(node);
  if (Array.isArray(node)) return node.map(brandNode);
  if (!isValidElement<{ children?: ReactNode }>(node) || node.type === Var) return node;
  if (!hasT3Text(node.props.children)) return node;
  const branded = brandNode(node.props.children);
  return cloneElement(node, undefined, ...(Array.isArray(branded) ? branded : [branded]));
};

export function T(props: ComponentProps<typeof RealT>): ReactElement {
  const { children, ...rest } = props;
  if (!hasT3Text(children)) return createElement(RealT, props);
  const branded = brandNode(children);
  // `rest` lacks only `children`, which follow as arguments.
  const realProps = rest as ComponentProps<typeof RealT>;
  return createElement(RealT, realProps, ...(Array.isArray(branded) ? branded : [branded]));
}
Object.assign(T, { _gtt: (RealT as { _gtt?: string })._gtt });
