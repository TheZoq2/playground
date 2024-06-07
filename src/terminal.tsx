import React from "react"
import Ansi from "@curvenote/ansi-to-react"

export function terminal(content: string) {
  return <div className = 'terminal-container'>
    <div className = 'terminal'>
      {content
        ? content
          .split("\n")
          .map((line) => {
            line = line
              .replace(/\[(Playground)\]/g, "[\x1b[90m$1\x1b[0m]")
              .replace(/\[(INFO)\]/g, "[\x1b[32m$1\x1b[0m]")
            return <div><Ansi>{line}</Ansi><br/></div>
          })
        : []
      }
    </div>
  </div>
}
