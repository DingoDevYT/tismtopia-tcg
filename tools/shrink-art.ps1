# Shrinks card art wider than 700px to 700px (phones lag decoding 2480x3508 PNGs). Run after tools/apply-cards.js.
Add-Type -AssemblyName System.Drawing
$W = 700
Get-ChildItem "$PSScriptRoot\..\art" -Recurse -File -Include *.png, *.jpg, *.jpeg | ForEach-Object {
  $img = [Drawing.Image]::FromFile($_.FullName)
  if ($img.Width -le $W) { $img.Dispose(); return }
  $h = [int]($img.Height * $W / $img.Width)
  $bmp = New-Object Drawing.Bitmap $W, $h
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.DrawImage($img, 0, 0, $W, $h)
  $g.Dispose(); $img.Dispose()
  $fmt = if ($_.Extension -eq '.png') { [Drawing.Imaging.ImageFormat]::Png } else { [Drawing.Imaging.ImageFormat]::Jpeg }
  $bmp.Save($_.FullName, $fmt); $bmp.Dispose()
}
