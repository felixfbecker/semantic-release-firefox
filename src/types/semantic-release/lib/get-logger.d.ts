import { Logger } from '../semantic-release'
function getLogger(process: { stdout: NodeJS.WriteStream; stderr: NodeJS.WriteStream }): Logger
export = getLogger
