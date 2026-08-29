import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { FileText, Image, Video, Music, Archive, File, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react"

type UploadedFile = {
  file: File
  status: 'uploading' | 'success' | 'error'
  progress: number
  id?: string
  error?: string
}

export function FileDropzone({ onChange, uploadEndpoint = '/api/upload/file' }: { 
  onChange?: (file: string | null, type: "add" | "remove") => void
  uploadEndpoint?: string 
}) {
  const [files, setFiles] = useState<UploadedFile[]>([])

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext || '')) {
      return <Image className="w-5 h-5 text-blue-500" />
    }
    if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext || '')) {
      return <Video className="w-5 h-5 text-purple-500" />
    }
    if (['mp3', 'wav', 'ogg', 'flac'].includes(ext || '')) {
      return <Music className="w-5 h-5 text-green-500" />
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
      return <Archive className="w-5 h-5 text-orange-500" />
    }
    if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext || '')) {
      return <FileText className="w-5 h-5 text-red-500" />
    }
    return <File className="w-5 h-5 text-gray-500" />
  }

  const uploadFile = async (file: File, index: number) => {
    const formData = new FormData()
    formData.append('file', file)

    try {
      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100)
          setFiles(prev => prev.map((f, i) => 
            i === index ? { ...f, progress } : f
          ))
        }
      })

      const uploadPromise = new Promise<{ id: string }>((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            resolve(JSON.parse(xhr.responseText))
          } else {
            reject(new Error('Upload failed'))
          }
        })
        xhr.addEventListener('error', () => reject(new Error('Network error')))
        xhr.open('POST', uploadEndpoint)
        xhr.send(formData)
      })

      const result = await uploadPromise

      onChange?.(result.id, "add")

      setFiles(prev => prev.map((f, i) =>
        i === index ? { ...f, status: 'success' as const, id: result.id } : f
      ))
    } catch (error) {
      setFiles(prev => prev.map((f, i) => 
        i === index ? { 
          ...f, 
          status: 'error' as const, 
          error: error instanceof Error ? error.message : 'Upload failed' 
        } : f
      ))
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const newFile: UploadedFile = {
        file,
        status: 'uploading',
        progress: 0
      }
      setFiles(prev => [...prev, newFile])
      
      uploadFile(file, files.length)
    }
  }

  const removeFile = (index: number, id: string) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
    onChange?.(id, "remove")
  }

  const getStatusIcon = (file: UploadedFile) => {
    if (file.status === 'uploading') {
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
    }
    if (file.status === 'success') {
      return <CheckCircle2 className="w-4 h-4 text-green-500" />
    }
    return <AlertCircle className="w-4 h-4 text-red-500" />
  }

  return (
    <div>
      <div
        className="border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/30 transition"
        onClick={() => document.getElementById("fileInput")?.click()}
      >
        <input
          id="fileInput"
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button variant="outline" type="button">
          Upload File
        </Button>
        <p className="text-sm text-muted-foreground mt-2">
          Drag & drop or click to upload
        </p>
      </div>
      
      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          {files.map((fileData, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 bg-muted rounded-lg"
            >
              {getFileIcon(fileData.file.name)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm truncate">{fileData.file.name}</span>
                  {getStatusIcon(fileData)}
                </div>
                {fileData.status === 'uploading' && (
                  <div className="mt-1">
                    <Progress value={fileData.progress} className="h-1.5" />
                    <span className="text-xs text-muted-foreground mt-0.5">
                      {fileData.progress}%
                    </span>
                  </div>
                )}
                {fileData.status === 'error' && (
                  <span className="text-xs text-red-500">{fileData.error}</span>
                )}
              </div>
              <button
                disabled={fileData.status === 'uploading'}
                onClick={() => removeFile(index, fileData.id || "")}
                className="text-muted-foreground hover:text-destructive transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}