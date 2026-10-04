import type { EntryData } from '../domain/model'
import { entryVersions, versionTextKey } from '../domain/sentenceVersions'

export function EntryVersions({
  data,
  canonicalAlreadyVisible = false,
}: {
  data: EntryData
  canonicalAlreadyVisible?: boolean
}) {
  const versions = entryVersions(data)
  if (!versions.length) return null
  return (
    <div className="entry-versions">
      {versions.map((version, index) => (
        <div key={index}>
          <span>
            {version.medium === 'both'
              ? 'Speaking & writing'
              : version.medium === 'spoken'
                ? 'Spoken'
                : 'Written'}
          </span>
          {!(
            canonicalAlreadyVisible && versionTextKey(version.text) === versionTextKey(data.text)
          ) && <p lang="en">{version.text}</p>}
        </div>
      ))}
    </div>
  )
}
