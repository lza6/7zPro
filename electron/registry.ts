import { exec } from 'child_process';
import { logger } from './logger';

// Run command with promise
const runCmd = (cmd: string, ignoreError: boolean = false): Promise<void> => {
    return new Promise((resolve, reject) => {
        exec(cmd, { windowsHide: true }, (error, _stdout, stderr) => {
            if (error) {
                if (!ignoreError) {
                    logger.error('Command error', {
                        cmd: cmd.length > 200 ? cmd.substring(0, 200) + '...' : cmd,
                        error: error.message,
                        stderr
                    });
                }
                reject(error);
            } else {
                resolve();
            }
        });
    });
};

/**
 * Clean up extra spaces and comments from PS script to keep EncodedCommand short
 */
const minifyPs = (script: string): string => {
    return script
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'))
        .join('\n');
};

export const registerContextMenu = async (appPath: string): Promise<boolean> => {
    try {
        logger.info('Starting context menu registration', { appPath });

        const escapedPath = appPath.replace(/'/g, "''");

        const script = `
            $ErrorActionPreference = 'SilentlyContinue'
            $exe = "${escapedPath}"
            $cu = [Microsoft.Win32.Registry]::CurrentUser
            
            function Set-Key($path, $verb, $icon, $cmd) {
                $s = $cu.CreateSubKey($path)
                $s.SetValue("", $verb)
                $s.SetValue("Icon", $icon)
                $c = $s.CreateSubKey("command")
                $c.SetValue("", "\`"$icon\`" $cmd")
                $s.Close(); $c.Close()
            }

            # 1. Cleanup
            $old = @(
                "Software\\Classes\\*\\shell\\7zPro",
                "Software\\Classes\\Directory\\shell\\7zPro",
                "Software\\Classes\\Directory\\Background\\shell\\7zPro",
                "Software\\Classes\\*\\shell\\7zP_C",
                "Software\\Classes\\*\\shell\\7zP_EH",
                "Software\\Classes\\*\\shell\\7zP_ES",
                "Software\\Classes\\Directory\\shell\\7zP_C",
                "Software\\Classes\\Directory\\Background\\shell\\7zP_C"
            )
            foreach($k in $old) { $cu.DeleteSubKeyTree($k, $false) }

            # 2. Flat Items for Files (*)
            Set-Key "Software\\Classes\\*\\shell\\7zP_C" "7zPro 压缩到..." $exe "--mini \`"%1\`""
            Set-Key "Software\\Classes\\*\\shell\\7zP_EH" "7zPro 解压到当前文件夹" $exe "--extract \`"%1\`""
            Set-Key "Software\\Classes\\*\\shell\\7zP_ES" "7zPro 解压到子文件夹" $exe "--extract-sub \`"%1\`""

            # 3. Folders
            Set-Key "Software\\Classes\\Directory\\shell\\7zP_C" "7zPro 压缩到..." $exe "--mini \`"%1\`""

            # 4. Background
            Set-Key "Software\\Classes\\Directory\\Background\\shell\\7zP_C" "7zPro 压缩当前文件夹" $exe "--mini \`"%V\`""

            # 5. Associations
            $assocId = "7zProArchive"
            $ak = $cu.CreateSubKey("Software\\Classes\\$assocId")
            $ak.SetValue("", "7zPro Archive")
            $ak.SetValue("Icon", $exe)
            $ok = $ak.CreateSubKey("shell\\open\\command")
            $ok.SetValue("", "\`"$exe\`" --extract \`"%1\`"")
            $ak.Close(); $ok.Close()

            foreach ($ext in @(".7z", ".zip", ".rar")) {
                $ek = $cu.CreateSubKey("Software\\Classes\\$ext")
                $ek.SetValue("", $assocId)
                $ek.Close()
            }

            # 6. SendTo
            $s = New-Object -ComObject WScript.Shell
            $sh = $s.CreateShortcut((Join-Path ([Environment]::GetFolderPath('SendTo')) '7zPro.lnk'))
            $sh.TargetPath = $exe; $sh.Arguments = '--mini'; $sh.IconLocation = "$exe,0"; $sh.Save()

            # 7. Refresh
            $n = '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int e, int f, IntPtr d1, IntPtr d2);'
            $t = Add-Type -MemberDefinition $n -Name "NS" -Namespace "S" -PassThru
            $t::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)
        `;

        const minifiedScript = minifyPs(script);
        const encodedScript = Buffer.from(minifiedScript, 'utf16le').toString('base64');
        await runCmd(`powershell -ExecutionPolicy Bypass -NoProfile -NonInteractive -EncodedCommand ${encodedScript}`);

        logger.info('Registration completed successfully');
        return true;
    } catch (error) {
        logger.error('Registration failed', error);
        return false;
    }
};

export const unregisterContextMenu = async (): Promise<boolean> => {
    try {
        logger.info('Starting context menu cleanup...');
        const script = `
            $ErrorActionPreference = 'SilentlyContinue'
            $cu = [Microsoft.Win32.Registry]::CurrentUser
            $keys = @(
                "Software\\Classes\\*\\shell\\7zPro",
                "Software\\Classes\\Directory\\shell\\7zPro",
                "Software\\Classes\\Directory\\Background\\shell\\7zPro",
                "Software\\Classes\\*\\shell\\7zP_C",
                "Software\\Classes\\*\\shell\\7zP_EH",
                "Software\\Classes\\*\\shell\\7zP_ES",
                "Software\\Classes\\Directory\\shell\\7zP_C",
                "Software\\Classes\\Directory\\Background\\shell\\7zP_C",
                "Software\\Classes\\.7z", "Software\\Classes\\.zip", "Software\\Classes\\.rar",
                "Software\\Classes\\7zProArchive"
            )
            foreach ($k in $keys) { $cu.DeleteSubKeyTree($k, $false) }
            
            $lnk = Join-Path ([Environment]::GetFolderPath('SendTo')) '7zPro.lnk'
            if (Test-Path -LiteralPath $lnk) { Remove-Item -LiteralPath $lnk -Force }

            $n = '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int e, int f, IntPtr d1, IntPtr d2);'
            $t = Add-Type -MemberDefinition $n -Name "NS" -Namespace "S" -PassThru
            $t::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)
        `;

        const minifiedScript = minifyPs(script);
        const encodedScript = Buffer.from(minifiedScript, 'utf16le').toString('base64');
        await runCmd(`powershell -ExecutionPolicy Bypass -NoProfile -NonInteractive -EncodedCommand ${encodedScript}`);

        logger.info('Unregistration completed successfully');
        return true;
    } catch (error) {
        logger.error('Unregistration failed', error);
        return false;
    }
};
