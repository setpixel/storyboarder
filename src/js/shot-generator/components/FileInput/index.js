import React, {useCallback} from 'react'

import {remote} from 'electron'
const {dialog} = remote
const defaultValue = "(none)"
const FileInput = React.memo(({
  value = defaultValue, 
  label, onChange, 
  wrapperClassName="input-group",
  refClassName="file-input",
  filters = [],
  canRemove = false,
  ...props
}) => {
  const onFileSelect = useCallback((e) => {
    e.preventDefault()
    if (!onChange) {
      return false
    }
    
    dialog.showOpenDialog(null, {filters})
    .then(({ filePaths }) => {
      if (filePaths.length) {
        onChange({
          file: filePaths[0],
          files: filePaths
        })
      } else {
        onChange({
          file: undefined,
          files: []
        })
      }
    })
    .catch(err => console.error(err))
    .finally(() => {
      // automatically blur to return keyboard control
      document.activeElement.blur()
    })    
  }, [onChange])
  
  return (
      <div className={ wrapperClassName }>
        {label ? <div className="input-group__label">{label}</div> : null}
        {canRemove && (value && value !== defaultValue) && <div> <a style={{position:"absolute", left:"96%", color:"#000000"}} onClick={ () => onChange({file: undefined, files: []}) }>X</a> </div>}
        <div
            className={ refClassName }
            onClick={ onFileSelect }
            title={value}
        >
          <a
            href="#"
            {...props}
          >
            {value}
          </a>
        </div>
      </div>
  )
})

export default FileInput
