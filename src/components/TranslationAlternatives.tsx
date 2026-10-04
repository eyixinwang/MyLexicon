import type { TranslationAlternative } from '../domain/model'

const mediumLabels = {
  spoken: '口语',
  written: '书面',
  both: '口语 / 书面',
}

export function TranslationAlternatives({
  alternatives,
}: {
  alternatives?: TranslationAlternative[]
}) {
  if (!alternatives?.length) return null
  return (
    <table className="translation-alternatives">
      <caption>Ways to express this</caption>
      <thead>
        <tr>
          <th scope="col">English expression</th>
          <th scope="col">Context & tone · 语境与语气</th>
        </tr>
      </thead>
      <tbody>
        {alternatives.map((alternative, index) => (
          <tr key={index}>
            <td lang="en">{alternative.en}</td>
            <td lang="zh">
              <span className="alternative-medium">{mediumLabels[alternative.medium]}</span>
              <p>{alternative.contextZh}</p>
              {alternative.meaningNotesZh && (
                <p className="alternative-nuance">
                  <b>含义差别：</b>
                  {alternative.meaningNotesZh}
                </p>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
