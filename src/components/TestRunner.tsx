
import { Play, RefreshCw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n';

interface TestRunnerProps {
  onRunTests: () => void;
  isRunning: boolean;
}

const TestRunner = ({ onRunTests, isRunning }: TestRunnerProps) => {
  const { t } = useTranslation();

  return (
    <div className="bg-white/80 backdrop-blur-sm border-2 border-slate-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 mb-2">{t('tests.testExecution')}</h2>
          <p className="text-slate-600">{t('tests.runTestSuiteMonitor')}</p>
        </div>
        
        <div className="flex gap-3">
          <Button
            onClick={onRunTests}
            disabled={isRunning}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 py-2 rounded-lg font-medium transition-all duration-200 hover:shadow-lg disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                {t('tests.runningTests')}
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                {t('tests.runAllTests')}
              </>
            )}
          </Button>
          
          {isRunning && (
            <Button
              variant="outline"
              className="border-red-200 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg font-medium transition-all duration-200"
            >
              <Square className="w-4 h-4 mr-2" />
              {t('tests.stop')}
            </Button>
          )}
        </div>
      </div>

      {isRunning && (
        <div className="mt-4">
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
          </div>
          <p className="text-sm text-slate-600 mt-2">{t('tests.executingTestSuite')}</p>
        </div>
      )}
    </div>
  );
};

export default TestRunner;
