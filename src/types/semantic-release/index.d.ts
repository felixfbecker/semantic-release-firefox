export interface Context {
    cwd: string
    env: { [name: string]: string }
    options: Options
    nextRelease: Release
    logger: Logger
}

export interface Options {
    dryRun: boolean
    noCi: boolean
    tagFormat: string
    branch: string
    repositoryUrl: string
}

export interface NotifyContext extends Context {
    releases: ReleaseInfo[]
}

export interface ReleaseInfo {
    name: string
    url: string
}

export interface Release {
    version: string
    gitTag: string
    notes: string
}

export interface Logger {
    log(...args: any[]): void
    error(...args: any[]): void
    success(...args: any[]): void
}

type ReleaseStep<CNFG extends object, CTX extends Context = Context, R = void> = (
    pluginConfig: CNFG,
    context: CTX
) => R | Promise<R>

export type VerifyConditionsStep<CNFG extends object> = ReleaseStep<CNFG>

export type PrepareStep<CNFG extends object> = ReleaseStep<CNFG>

export type PublishStep<CNFG extends object> = ReleaseStep<CNFG, Context, ReleaseInfo>

export type NotifyStep<CNFG extends object> = ReleaseStep<CNFG, NotifyContext>
