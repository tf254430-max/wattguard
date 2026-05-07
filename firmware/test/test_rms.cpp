// PlatformIO native unit test for the RMS routine.
// Run with: pio test -e native (after adding a [env:native] section locally)
//
// We replicate the math the firmware does instead of pulling in the whole
// firmware (which depends on Arduino headers).

#include <unity.h>
#include <math.h>

static float rms_of_sine(float amplitude, int samples) {
    double sumSq = 0.0;
    for (int i = 0; i < samples; i++) {
        double angle = (2.0 * M_PI * i) / samples;
        double v = amplitude * sin(angle);
        sumSq += v * v;
    }
    return (float)sqrt(sumSq / samples);
}

void test_rms_of_unit_sine_is_one_over_sqrt_two(void) {
    float r = rms_of_sine(1.0f, 1000);
    TEST_ASSERT_FLOAT_WITHIN(0.005f, 0.7071f, r);
}

void test_rms_of_5a_sine_is_3_535(void) {
    float r = rms_of_sine(5.0f, 1000);
    TEST_ASSERT_FLOAT_WITHIN(0.02f, 3.5355f, r);
}

void test_rms_of_zero_is_zero(void) {
    float r = rms_of_sine(0.0f, 1000);
    TEST_ASSERT_FLOAT_WITHIN(0.001f, 0.0f, r);
}

int main(int argc, char** argv) {
    UNITY_BEGIN();
    RUN_TEST(test_rms_of_unit_sine_is_one_over_sqrt_two);
    RUN_TEST(test_rms_of_5a_sine_is_3_535);
    RUN_TEST(test_rms_of_zero_is_zero);
    return UNITY_END();
}
