import type { StudentRank } from '../../shared/types.ts'

// White has no certificate — it's the starting rank, never "achieved" via
// promotion, so there's nothing to print. Whichever ranks have an entry here
// (and an actual template file on disk, checked at runtime) are the ones
// offered in the certificate rank picker.
export const RANK_TEMPLATE_FILES: Partial<Record<StudentRank, string>> = {
  Yellow: 'yellow.pdf',
  Orange: 'orange.pdf',
  Purple: 'purple.pdf',
  Blue: 'blue.pdf',
  Green: 'green.pdf',
  'Brown 3rd': 'brown-3rd.pdf',
  'Brown 2nd': 'brown-2nd.pdf',
  'Brown 1st': 'brown-1st.pdf',
  Black: 'black.pdf',
}

// Shared coordinates across every template in this placeholder set, since
// they were all generated with an identical layout. Real replacement
// templates may need per-rank overrides here if their layouts differ —
// see scripts/certificate-calibrate.ts for finding new coordinates.
export const NAME_POSITION = { x: 260, y: 330 }
export const DATE_POSITION = { x: 260, y: 210 }

export function isCertificateRank(rank: string): rank is StudentRank {
  return rank in RANK_TEMPLATE_FILES
}
