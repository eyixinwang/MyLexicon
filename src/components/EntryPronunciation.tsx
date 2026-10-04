import type { EntryData } from '../domain/model'

export function EntryPronunciation({ data }: { data: EntryData }) {
  const existing = data.pronunciation?.trim()
  const showExisting =
    existing &&
    existing !== data.pronunciationUk?.trim() &&
    existing !== data.pronunciationUs?.trim()
  if (!data.pronunciationUk && !data.pronunciationUs && !showExisting) return null
  return (
    <div className="entry-pronunciations" aria-label="IPA pronunciations">
      {data.pronunciationUk && (
        <p>
          <b>British (UK)</b> <span>{data.pronunciationUk}</span>
        </p>
      )}
      {data.pronunciationUs && (
        <p>
          <b>American (US)</b> <span>{data.pronunciationUs}</span>
        </p>
      )}
      {showExisting && (
        <p className="existing-pronunciation">
          <b>Pronunciation</b> <span>{existing}</span>
        </p>
      )}
    </div>
  )
}
