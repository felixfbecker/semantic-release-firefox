export = class HtmlToMdConverter {
    convert(html: string, callback: (error?: Error, markdown: string) => void): void
}
