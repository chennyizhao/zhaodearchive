$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$jobs = [Console]::In.ReadToEnd() | ConvertFrom-Json
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
$parameters = New-Object System.Drawing.Imaging.EncoderParameters 1
$parameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]83)
try {
  foreach ($job in $jobs) {
    $image = [System.Drawing.Image]::FromFile($job.source)
    try {
      $scale = [Math]::Min(1.0, 680.0 / [Math]::Max($image.Width, $image.Height))
      $width = [Math]::Max(1, [int]($image.Width * $scale))
      $height = [Math]::Max(1, [int]($image.Height * $scale))
      $bitmap = New-Object System.Drawing.Bitmap $width, $height
      try {
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
          $graphics.Clear([System.Drawing.Color]::White)
          $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
          $graphics.DrawImage($image, 0, 0, $width, $height)
        } finally {
          $graphics.Dispose()
        }
        $bitmap.Save($job.destination, $codec, $parameters)
      } finally {
        $bitmap.Dispose()
      }
    } finally {
      $image.Dispose()
    }
  }
} finally {
  $parameters.Dispose()
}
