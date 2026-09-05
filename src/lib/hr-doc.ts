/**
 * HR document types — shared between the service layer and the UI so the
 * select options and validation always agree.
 */

export const HR_DOC_TYPES = [
  "offer_letter",
  "contract",
  "id_proof",
  "degree_certificate",
  "bank_details",
  "tax_documents",
  "other",
] as const;
export type HrDocType = (typeof HR_DOC_TYPES)[number];

export const HR_DOC_LABELS: Record<HrDocType, string> = {
  offer_letter: "Offer letter",
  contract: "Employment contract",
  id_proof: "ID proof",
  degree_certificate: "Degree / certificate",
  bank_details: "Bank details",
  tax_documents: "Tax documents",
  other: "Other",
};

export function hrDocLabel(t: string): string {
  return HR_DOC_LABELS[t as HrDocType] ?? t;
}

export function isHrDocType(t: string): t is HrDocType {
  return (HR_DOC_TYPES as readonly string[]).includes(t);
}
