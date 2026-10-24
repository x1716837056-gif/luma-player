$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
try {
  $lumaConnection=[Console]::In.ReadToEnd() | ConvertFrom-Json
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class LumaSmb {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Resource { public int Scope, Type, DisplayType, Usage; public string LocalName, RemoteName, Comment, Provider; }
  [DllImport("mpr.dll", CharSet=CharSet.Unicode)]
  public static extern int WNetAddConnection2(ref Resource resource, string password, string username, int flags);
}
'@
  $lumaResource=New-Object LumaSmb+Resource
  $lumaResource.Type=1
  $lumaResource.RemoteName=$lumaConnection.root
  $lumaCode=[LumaSmb]::WNetAddConnection2([ref]$lumaResource,$lumaConnection.password,$lumaConnection.username,0)
  [Console]::Out.Write($lumaCode)
} catch { [Console]::Out.Write('1203') }
