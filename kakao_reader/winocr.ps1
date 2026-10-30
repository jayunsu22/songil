# 윈도우에 들어 있는 글자 읽기(OCR, 한국어)로 그림 파일의 글자를 읽는다. 인터넷·AI 를 쓰지 않는다.
# 사용: powershell -NoProfile -ExecutionPolicy Bypass -File winocr.ps1 그림1.png [그림2.png ...]
# 출력: 그림마다 "#FILE 경로" 한 줄, 그 아래 글 줄마다 "x y 너비 높이<TAB>글"
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(); $task.Result }

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('ko'))
if (-not $engine) { Write-Output 'NO_KOREAN_OCR'; exit 2 }
foreach ($Path in $args) {
    Write-Output ("#FILE " + $Path)
    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path $Path).Path)) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bmp = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await ($engine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
    foreach ($line in $result.Lines) {
        $x1 = 99999; $y1 = 99999; $x2 = 0; $y2 = 0
        foreach ($wd in $line.Words) {
            $r = $wd.BoundingRect
            $x1 = [Math]::Min($x1, $r.X); $y1 = [Math]::Min($y1, $r.Y)
            $x2 = [Math]::Max($x2, $r.X + $r.Width); $y2 = [Math]::Max($y2, $r.Y + $r.Height)
        }
        Write-Output ("{0} {1} {2} {3}`t{4}" -f [int]$x1, [int]$y1, [int]($x2 - $x1), [int]($y2 - $y1), $line.Text)
    }
    $stream.Dispose()
}
