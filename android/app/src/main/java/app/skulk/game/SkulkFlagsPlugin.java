package app.skulk.game;

import android.content.pm.ApplicationInfo;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Tells the web bundle whether this APK is debuggable. Release builds are not. */
@CapacitorPlugin(name = "SkulkFlags")
public class SkulkFlagsPlugin extends Plugin {
    @PluginMethod
    public void isDebuggable(PluginCall call) {
        boolean debug = (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        JSObject result = new JSObject();
        result.put("debug", debug);
        call.resolve(result);
    }
}
