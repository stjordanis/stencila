/* eslint-disable @typescript-eslint/camelcase */
import { dump, read, write } from '@stencila/encoda'
import { Article, isA, Organization, Person } from '@stencila/schema'
import glob from 'globby'
import got from 'got'
import path from 'path'
import fs from 'fs'

const mdPaths = glob.sync(path.join(__dirname, '/{guides,hub}/**/*.md'))
const authToken = process.env.INTERCOM_AUTH_TOKEN
const intercomUrl = 'https://intercom.help/stencila/en/articles'

// Using async is inconvenient in `String.replace`.
// This is a synchronous function to read an article's `id` and `title` given a `filepath`.
const getArticleProps = (filePath: string): { id?: string; title: string } => {
  const linkedFileRaw = fs.readFileSync(filePath).toString()

  const [, id] = linkedFileRaw.match(/id: (\d+)/) ?? []
  const [, title] = linkedFileRaw.match(/title: (.+)/) ?? []

  return { id, title }
}

interface IntercomPartialArticle {
  id?: string
  author_id: string
  body?: string
  description?: string
  parent_id?: string
  parent_type?: 'collection' | 'section'
  state?: 'draft' | 'published'
  title: string
  translated_content?: Record<string, Article>
}

interface IntercomArticle extends Required<IntercomPartialArticle> {
  type: 'article'
  id: string
  errors?: string[]
}

const slugify = (text: string): string => text.toLowerCase().replace(/\s/g, '-')

const resolveArticleLinks = (filePath: string) => async (
  article: string
): Promise<string> => {
  const relativeUrlRegEx = /href=['"](.{1,2}\/.*\.md)['"]/g
  return article.replace(
    relativeUrlRegEx,
    (match, link: string | undefined): string => {
      if (link === undefined) {
        return match
      }

      const { id, title } = getArticleProps(path.resolve(filePath, link))

      if (id === undefined) {
        throw new Error(
          `"${title}" must be published before you can link to it.`
        )
      }

      if (typeof title === 'string') {
        return `href="${intercomUrl}/${id}-${slugify(title)}"`
      }

      return match
    }
  )
}

/**
 * Make an API request to Intercom servers.
 * If the article in the payload contains an `id`, update it, otherwise create a new one.
 */
const upsertArticle = (
  payload: IntercomPartialArticle
): Promise<IntercomArticle> => {
  const articlesUrl = 'https://api.intercom.io/articles'
  const url =
    payload.id === undefined ? articlesUrl : `${articlesUrl}/${payload.id}`

  const method = payload.id === undefined ? 'POST' : 'PUT'

  return got<IntercomArticle>(url, {
    method,
    headers: {
      Authorization: `Bearer ${authToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    json: { ...payload },
    responseType: 'json',
  })
    .then((res) => res.body)
    .then((res) => {
      if (res.errors !== undefined && res.errors.length > 0) {
        console.log(res)
        throw new Error(JSON.stringify(res))
      }
      return res
    })
}

/**
 * Assume that Paragraphs containing a single Link element should be stylized as buttons
 */
const buttonifyLinks = (article: string): string => {
  const buttonLinkRegEx = /<p><a ([^>]+)>[^<]+?<\/a><\/p>/g
  return article.replace(buttonLinkRegEx, (match, attrs) =>
    match
      .replace('<p>', '<div class="intercom-align-center">')
      .replace(attrs, `${attrs} class="intercom-h2b-button"`)
      .replace('</p>', '</div>')
  )
}

/**
 * HTML article generated by Encoda includes an `H1` and an `abstract` summary text.
 * Both those elements are already present in the Intercom article pages, so remove them from the article body.
 */
const removeDuplicateIntro = (article: string): string => {
  const introRegEx = /^\s*<h1 itemprop="headline">[\s\S]*<section data-itemprop="description">[\s\S]*<\/section>$/m
  return article.replace(introRegEx, '')
}

/**
 * Given a `Person` node construct an HTML contact markup with `email` and `url` links.
 */
const formatAuthor = (author: Person): string => {
  const { givenNames = [], familyNames = [], emails = [], url } = author

  let name = `${givenNames.join(' ')} ${familyNames.join(' ')}`

  if (emails.length > 0) {
    name += ' '
    name += emails.map((email) => `<a href="mailto:${email}">✉️</a>`)
  }

  if (url !== undefined) {
    name += ` <a href="${url}">🔗</a>`
  }

  // Collapse multiple whitespaces
  return name.replace('  ', ' ')
}

const furtherReadingLinks = (filePath: string) => (
  relatedArticles: string[] = []
) => (article: string): string =>
  relatedArticles.length === 0
    ? article
    : article.replace(
        '</article>',
        `
<h2>Further reading</h2>

${relatedArticles.reduce((rels, rel) => {
  const { title } = getArticleProps(path.resolve(filePath, rel))
  return (
    rels +
    `
  <div class="intercom-container">
    <a href="${rel}" class="intercom-h2b-button">${title}</a>
  </div>
  `
  )
}, '')}

</article>
`
      )

const createAuthorsSection = (authors: (Person | Organization)[] = []) => (
  article: string
): string =>
  authors.length === 0
    ? article
    : article.replace(
        '</article>',
        `
<h2>Contributors</h2>

<p>
${authors.reduce(
  (allAuthors: string, author, idx) =>
    isA('Organization', author)
      ? allAuthors
      : `${allAuthors}${formatAuthor(author)}${
          idx < authors.length - 1 ? ', ' : '.'
        }`,
  ''
)}
</p>
</article>
`
      )

const insertFooter = (filePath: string) => (article: string): string => {
  const relLink = filePath.replace(path.sep, '/').replace(/.+\/help\/hub\//, '')
  const gitHubLink = `https://github.com/stencila/stencila/blob/master/help/hub/${relLink}`

  return article.replace(
    '</article>',
    `
<h2>Still have questions?</h2>

<p>
Reach out to us at <a href="mailto:hello@stenci.la">hello@stenci.la</a> or on our <a
href="https://discord.gg/uFtQtk9">Discord channel</a>.
</p>

<h2>Help the help</h2>

<p>
  Help make this help article better <a href="${gitHubLink}">by contributing improvements</a>.
</p>
</article>
`
  )
}

const processArticle = (
  ...fns: ((article: string) => string | Promise<string>)[]
) => async (article: string): Promise<string> => {
  let processedArticle = article
  for (const fn of fns) {
    processedArticle = await fn(processedArticle)
  }
  return processedArticle
}

type HelpArticle = Article & {
  id: string | undefined
  description?: string
  published?: boolean
  parent_type?: string
  collectionId?: string
  relatedArticles?: string[]
}
/**
 * Read a Markdown file, construct an Intercom Article API compatible payload.
 * If the article is already present on Intercom update it, otherwise create a new article.
 */
const postArticle = async (
  filePath: string,
  authorId: string,
  index: number
): Promise<IntercomPartialArticle> => {
  const article = (await read(filePath)) as HelpArticle
  const bodyRaw = await dump(article, 'html', {
    isStandalone: false,
    theme: 'stencila',
  })

  // Process the ingested HTML contents with various adjustments
  const body = await processArticle(
    removeDuplicateIntro,
    buttonifyLinks,
    furtherReadingLinks(path.dirname(filePath))(article.relatedArticles),
    createAuthorsSection(article.authors),
    insertFooter(filePath),
    resolveArticleLinks(path.dirname(filePath))
  )(bodyRaw)

  if (article.description && article.description.length > 140) {
    throw new Error(
      `"${article.title}" description field must be 140 characters or less.`
    )
  }

  const articlePayload: IntercomPartialArticle = {
    author_id: authorId,
    body,
    description: article.description,
    id: article.id,
    parent_id: article.collectionId,
    parent_type:
      article.parent_type === 'collection' || article.parent_type === 'section'
        ? article.parent_type
        : undefined,
    state: article.published === true ? 'published' : 'draft',
    title: typeof article.title === 'string' ? article.title : '',
  }

  try {
    if (article.id === undefined) {
      console.log(
        `🎉 ${index}/${mdPaths.length} Creating article: "${article.title}"`
      )
      // This is a new article that doesn't exist on Intercom yet.
      // Post to Intercom, and update the MD file with the returned ID
      const res = await upsertArticle(articlePayload)
      await write({ ...article, id: parseInt(res.id, 10) }, filePath, {
        format: 'md',
        theme: 'stencila',
      })
    } else {
      console.log(
        `🔄 ${index}/${mdPaths.length} Updating article: "${article.title} (#${article.id})"`
      )
      await upsertArticle(articlePayload)
    }
  } catch (err) {
    console.log(err)
  }

  return articlePayload
}

/**
 * Iterate through all Markdown help articles and submit them to Intercom.
 */
const updateAllArticles = async (): Promise<void> => {
  const authorId = process.env.INTERCOM_AUTHOR_ID

  if (authorId === undefined) {
    throw new Error('Author ID environment variable is missing')
  }

  if (authToken === undefined) {
    throw new Error('Intercom API auth token environment variable is missing')
  }

  let progressMeter = 1
  for (const file of mdPaths) {
    await postArticle(file, authorId, progressMeter).catch((e) => {
      // Terminate build in case of errors
      throw new Error(e)
    })
    progressMeter++
  }
}

updateAllArticles().catch(console.error)
