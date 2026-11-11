import { inquiryJson } from "@/lib/inquiry/http";
import { PRODUCT_HINTS } from "@/lib/ui-text";

/** Produktarten, die `product` einer Anfrage annehmen kann. */
export function GET() {
  return inquiryJson({ products: PRODUCT_HINTS.map((p) => ({ value: p.value, label: p.label })) });
}
